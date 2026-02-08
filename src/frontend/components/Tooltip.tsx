import { ReactNode, useState, useRef, useEffect } from "react";

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  width?: string;
  className?: string;
}

export function Tooltip({
  content,
  children,
  width = "w-48",
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // Position below with margin
        left: rect.left + rect.width / 2, // Center horizontally
      });
    }
  }, [isVisible]);

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-block ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          className={`fixed z-[9999] px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-lg tooltip dark:bg-gray-700 ${width} max-w-md`}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: "translateX(-50%)",
            marginTop: "8px",
          }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          {typeof content === "string" ? (
            content
          ) : (
            <div className="whitespace-normal">{content}</div>
          )}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -mb-1">
            <div className="border-4 border-transparent border-b-gray-900 dark:border-b-gray-700" />
          </div>
        </div>
      )}
    </>
  );
}
