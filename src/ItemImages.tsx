import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ItemImages({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const multiple = images.length > 1;
  const move = (direction: number) => {
    if (multiple)
      setIndex(
        (current) => (current + direction + images.length) % images.length,
      );
  };

  return (
    <div
      className="item-images"
      role="region"
      aria-label={`${name} images`}
      aria-roledescription={multiple ? "carousel" : undefined}
      onKeyDown={(event) => {
        if (
          multiple &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
      onTouchStart={(event) => {
        touchStart.current =
          multiple && event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy))
          move(dx < 0 ? 1 : -1);
      }}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <img
        className="detail-image"
        src={images[index] || "/illustrations/coffee.svg"}
        alt={
          multiple ? `${name} — image ${index + 1} of ${images.length}` : name
        }
        draggable={false}
      />
      {multiple && (
        <>
          <button
            type="button"
            className="image-arrow previous"
            aria-label="Previous image"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="image-arrow next"
            aria-label="Next image"
            onClick={() => move(1)}
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>
          <span className="image-position" role="status" aria-atomic="true">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>
  );
}
