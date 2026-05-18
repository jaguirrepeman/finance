export function Spinner({
  className = "",
  size,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "h-10 w-10" : size === "sm" ? "h-5 w-5" : "h-8 w-8";
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div
        className={`${sizeClass} rounded-full border-2 border-border-glass border-t-accent-glow animate-spin`}
      />
    </div>
  );
}
