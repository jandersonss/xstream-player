interface LoaderProps {
    size?: 'small' | 'large';
}

export default function Loader({ size = 'large' }: LoaderProps) {
    const isSmall = size === 'small';
    return (
        <div className={`flex items-center justify-center ${isSmall ? 'py-4' : 'min-h-[50vh]'}`}>
            <div className={`relative ${isSmall ? 'w-8 h-8' : 'w-16 h-16'}`}>
                <div className={`absolute top-0 left-0 w-full h-full rounded-full border-red-600 animate-spin border-t-transparent ${isSmall ? 'border-2' : 'border-4'}`}></div>
                {!isSmall && (
                    <div className="absolute top-0 left-0 w-full h-full border-4 border-[#333] rounded-full -z-10"></div>
                )}
            </div>
        </div>
    );
}
