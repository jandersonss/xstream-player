import * as db from './db';
import { getDeviceProfile } from './deviceProfile';

interface StreamSyncOptions {
    type: 'live' | 'movie' | 'series';
    action: string;
    credentials: any;
    signal: AbortSignal;
    onProgress: (processed: number, total: number) => void;
    mapItem: (item: any, type: 'live' | 'movie' | 'series') => db.CachedStream;
}

/**
 * Yield to the event loop to prevent UI freezing on low-power devices.
 */
function yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Synchronize streams using NDJSON streaming endpoint.
 * Fallback to XMLHttpRequest for webOS 4 (Chrome 53-60) which doesn't support ReadableStream.
 */
export async function streamSyncStreams(options: StreamSyncOptions): Promise<void> {
    const { type, action, credentials, signal, onProgress, mapItem } = options;
    const profile = getDeviceProfile();
    const batchSize = profile.streamBatchSize;

    return new Promise((resolve, reject) => {
        let isAborted = false;
        
        signal.addEventListener('abort', () => {
            isAborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
        });

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/proxy/stream');
        xhr.setRequestHeader('Content-Type', 'application/json');

        let lastIndex = 0;
        let totalItems = 0;
        let processedItems = 0;
        let batch: db.CachedStream[] = [];
        let buffer = '';

        const flushBatch = async () => {
            if (batch.length > 0) {
                const currentBatch = [...batch];
                batch = []; // Clear immediately to free memory
                await db.saveStreams(currentBatch);
                processedItems += currentBatch.length;
                if (totalItems > 0) {
                    onProgress(processedItems, totalItems);
                }
                
                if (profile.yieldBetweenBatches) {
                    await yieldToEventLoop();
                }
            }
        };

        const processChunk = async (chunk: string) => {
            if (isAborted) return;
            
            buffer += chunk;
            const lines = buffer.split('\n');
            
            // Keep the last line in buffer as it might be incomplete
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const parsed = JSON.parse(line);
                    
                    if (parsed.type === 'header') {
                        totalItems = parsed.total || 0;
                        console.log(`[Stream] Header received: ${totalItems} items for ${action}`);
                    } else if (parsed.type === 'item') {
                        const item = parsed.data;
                        const slimItem = mapItem(item, type);
                        batch.push(slimItem);

                        if (batch.length >= batchSize) {
                            await flushBatch();
                        }
                    } else if (parsed.type === 'done') {
                        console.log(`[Stream] Done message received for ${action}`);
                    }
                } catch (e) {
                    console.warn(`[Stream] Failed to parse line in chunk`, e);
                }
            }
        };

        xhr.onprogress = async () => {
            if (isAborted) {
                xhr.abort();
                return;
            }

            const currentText = xhr.responseText;
            // Get the new part of the text since last time
            const chunk = currentText.substring(lastIndex);
            lastIndex = currentText.length;
            
            await processChunk(chunk);
            
            // Note: responseText grows in memory until the request finishes.
            // For ~10MB this is acceptable even on webOS 4. 
            // In modern browsers, fetch() with ReadableStream would be better to avoid this,
            // but XHR is the most compatible fallback.
        };

        xhr.onload = async () => {
            if (isAborted) return;
            
            if (xhr.status >= 200 && xhr.status < 300) {
                // Process any remaining text in response
                const remainingChunk = xhr.responseText.substring(lastIndex);
                if (remainingChunk) {
                    await processChunk(remainingChunk);
                }
                // Process whatever is left in the buffer
                if (buffer.trim()) {
                    try {
                        const parsed = JSON.parse(buffer);
                        if (parsed.type === 'item') {
                            batch.push(mapItem(parsed.data, type));
                        }
                    } catch (e) {
                        // Ignore trailing empty lines
                    }
                }
                
                // Flush final batch
                await flushBatch();
                
                if (totalItems === 0 || processedItems < totalItems) {
                    onProgress(processedItems, Math.max(totalItems, processedItems));
                }
                
                console.log(`[Stream] Finished ${action}. Processed ${processedItems}/${totalItems}`);
                resolve();
            } else {
                reject(new Error(`Stream failed with status: ${xhr.status} ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            if (!isAborted) {
                reject(new Error('Network error during stream'));
            }
        };
        
        signal.addEventListener('abort', () => {
            xhr.abort();
        });

        xhr.send(JSON.stringify({
            ...credentials,
            action
        }));
    });
}
