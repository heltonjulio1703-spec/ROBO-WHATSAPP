import React from "react";

interface WhatsAppIconProps {
  className?: string;
}

export const WhatsAppIcon: React.FC<WhatsAppIconProps> = ({ className = "w-5 h-5" }) => {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} inline-block shrink-0`}
    >
      {/* Green Rounded Square Background */}
      <rect width="512" height="512" rx="110" fill="#25D366" />
      
      {/* Outer White Speech Bubble Contour */}
      <path
        d="M256.1 102c-84.8 0-153.8 68.8-153.8 153.6 0 27.1 7 53.5 20.3 76.8l-21.6 78.8 80.8-21.1c22.5 12.3 48 18.8 74.3 18.8 84.8 0 153.8-68.8 153.8-153.5S340.9 102 256.1 102z"
        fill="#FFFFFF"
      />
      
      {/* Inner Green Circle Cutout */}
      <circle cx="256.1" cy="255.6" r="126" fill="#25D366" />
      
      {/* Inner White Phone Handset */}
      <path
        d="M211.5 190.3c-3.5-7.8-7.2-7.9-10.5-8-2.7-.1-5.9-.1-9.1-.1-3.2 0-8.3 1.2-12.7 6-4.4 4.8-16.7 16.3-16.7 39.7 0 23.4 17.1 46 19.4 49.2 2.4 3.2 33.1 52.8 81.8 72.1 40.5 16 48.7 12.8 57.5 12 8.8-.8 28.2-11.5 32.2-22.6 4-11.1 4-20.6 2.8-22.6-1.2-2-4.4-3.2-9.1-5.6-4.8-2.4-28.2-13.9-32.6-15.5-4.4-1.6-7.6-2.4-10.8 2.4-3.2 4.8-12.3 15.5-15.1 18.7-2.8 3.2-5.6 3.6-10.4 1.2-4.8-2.4-20.1-7.4-38.3-23.6-14.2-12.6-23.8-28.2-26.6-33-2.8-4.8-.3-7.4 2.1-9.8 2.2-2.2 4.8-5.6 7.2-8.3 2.4-2.8 3.2-4.8 4.8-8 1.6-3.2.8-6-.4-8.4-1.2-2.4-10.5-25.7-14.8-35.3z"
        fill="#FFFFFF"
      />
    </svg>
  );
};
