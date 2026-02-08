import { useEffect, useState } from "react";

interface MemePopupProps {
  isOpen: boolean;
  memeUrl: string;
  onClose: () => void;
}

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function MemePopup({ isOpen, memeUrl, onClose }: MemePopupProps) {
  const [corner, setCorner] = useState<Corner>("top-right");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Randomly select a corner
      const corners: Corner[] = [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ];
      const randomCorner = corners[
        Math.floor(Math.random() * corners.length)
      ] as Corner;
      setCorner(randomCorner);
      setIsVisible(true);

      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          onClose();
        }, 300); // Wait for animation to complete
      }, 10000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getCornerStyles = () => {
    switch (corner) {
      case "top-left":
        return {
          top: "1rem",
          left: "1rem",
          transform: isVisible ? "translate(0, 0)" : "translate(-100%, -100%)",
        };
      case "top-right":
        return {
          top: "1rem",
          right: "1rem",
          transform: isVisible ? "translate(0, 0)" : "translate(100%, -100%)",
        };
      case "bottom-left":
        return {
          bottom: "1rem",
          left: "1rem",
          transform: isVisible ? "translate(0, 0)" : "translate(-100%, 100%)",
        };
      case "bottom-right":
        return {
          bottom: "1rem",
          right: "1rem",
          transform: isVisible ? "translate(0, 0)" : "translate(100%, 100%)",
        };
    }
  };

  return (
    <div
      className="fixed z-50 transition-transform duration-300 ease-out"
      style={getCornerStyles()}
    >
      <div className="relative max-w-xs md:max-w-sm lg:max-w-md">
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 bg-white text-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold hover:bg-gray-100 shadow-lg z-10"
        >
          ×
        </button>
        <img
          src={memeUrl}
          alt="random meme"
          className="max-w-full max-h-[60vh] rounded-lg shadow-2xl border-4 border-white"
        />
      </div>
    </div>
  );
}
