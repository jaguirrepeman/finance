import { useState, useRef } from "react";
import { createPortal } from "react-dom";

interface HoverTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wrap any element to show a styled dashboard tooltip on hover.
 * Renders the tooltip via a portal so it's never clipped by overflow:hidden parents.
 */
export function HoverTooltip({ content, children, className, style: outerStyle }: HoverTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const targetRef = useRef<HTMLDivElement>(null);

  const show = () => {
    if (!targetRef.current) return;
    const rect = targetRef.current.getBoundingClientRect();
    setStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: Math.max(8, rect.left + rect.width / 2 - 100),
      zIndex: 10000,
      pointerEvents: "none",
    });
    setVisible(true);
  };

  const hide = () => setVisible(false);

  return (
    <div
      ref={targetRef}
      className={className}
      style={outerStyle}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible &&
        createPortal(
          <div
            style={{
              ...style,
              background: "rgba(18, 18, 30, 0.97)",
              border: "1px solid rgba(139, 92, 246, 0.25)",
              borderRadius: 10,
              fontSize: 11,
              color: "hsl(0, 0%, 98%)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
              padding: "6px 10px",
              maxWidth: 240,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
