export default function IncognitoIcon({ size = 16, className = '', strokeWidth = 2.2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 ${className}`}
      {...props}
    >
      {/* Fedora Hat Crown */}
      <path
        d="M6.8 11.5L8.2 4.8C8.4 3.6 9.6 2.8 10.8 3C11.5 3.2 12.5 3.2 13.2 3C14.4 2.8 15.6 3.6 15.8 4.8L17.2 11.5Z"
        fill="currentColor"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Hat Ribbon */}
      <path
        d="M7.2 9.5H16.8"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Fedora Curved Brim */}
      <path
        d="M2.5 12C5.5 10.8 18.5 10.8 21.5 12C22.6 12.4 22.6 13.2 21.2 13.8C18.2 14.9 5.8 14.9 2.8 13.8C1.4 13.2 1.4 12.4 2.5 12Z"
        fill="currentColor"
      />

      {/* Sunglasses Lenses */}
      <circle
        cx="7.5"
        cy="18"
        r="3.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="currentColor"
        fillOpacity="0.4"
      />
      <circle
        cx="16.5"
        cy="18"
        r="3.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="currentColor"
        fillOpacity="0.4"
      />

      {/* Sunglasses Bridge */}
      <path
        d="M10.7 17.5C11.5 16.5 12.5 16.5 13.3 17.5"
        stroke="currentColor"
        strokeWidth={Number(strokeWidth) + 0.3}
        strokeLinecap="round"
      />

      {/* Glass Glare Reflections */}
      <path
        d="M6.1 17.5L7.9 15.5"
        stroke="currentColor"
        strokeWidth={Math.max(1.5, Number(strokeWidth) - 0.4)}
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M15.1 17.5L16.9 15.5"
        stroke="currentColor"
        strokeWidth={Math.max(1.5, Number(strokeWidth) - 0.4)}
        strokeLinecap="round"
        opacity="0.95"
      />
    </svg>
  );
}
