'use client';

import { Bookmark } from 'lucide-react';
import Button, { type ButtonSize } from './ui/Button';
import { useFavorites, type FavoriteItem } from '../app/context/FavoritesContext';
import { useT } from '../app/context/I18nContext';

export interface FavoriteButtonProps {
    /** The card payload to store when the item is added. */
    item: FavoriteItem;
    size?: ButtonSize;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

/**
 * "Minha lista" toggle shared by the hero and the movie/series detail screens.
 *
 * A single implementation so the three call sites cannot drift apart again (they
 * used to: two showed an icon-only button whose "saved" state was an invisible
 * surface shift, one showed a labelled button that read fine). The saved state is
 * carried by a filled glyph plus a label swap — never a coloured fill, since spec
 * 00 §2.1 reserves white for focus and red for on-air.
 */
export default function FavoriteButton({ item, size = 'lg' }: FavoriteButtonProps) {
    const { isFavorite, addFavorite, removeFavorite } = useFavorites();
    const t = useT();
    const saved = isFavorite(item.id, item.type);

    return (
        <Button
            variant="secondary"
            size={size}
            aria-pressed={saved}
            onClick={() => (saved ? removeFavorite(item.id, item.type) : addFavorite(item))}
        >
            <Bookmark
                size={ICON_SIZE[size]}
                className="mr-2"
                fill={saved ? 'currentColor' : 'none'}
            />
            {saved ? t('favorites.inList') : t('favorites.addToList')}
        </Button>
    );
}
