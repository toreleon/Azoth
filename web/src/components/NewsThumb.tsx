import { useEffect, useState } from "react";
import "./NewsThumb.css";

interface NewsThumbProps {
  /** Article image URL, or undefined when the source has no real thumbnail. */
  src?: string;
}

/**
 * Article thumbnail for the news feeds, Google-Finance style. Renders nothing
 * when there is no image or the CDN fails, so a dead image never leaves a gap.
 * Decorative: the headline beside it already carries the meaning.
 */
export default function NewsThumb({ src }: NewsThumbProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (!src || broken) return null;
  return (
    <img
      className="news-thumb"
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      // Don't hand the publisher's CDN the page the reader is on.
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}
