// Mark — one mark, settled (docs/marks/README.md §6):
//
//   <Mark id="star" size={20} />
//
// Exactly what marks.js's renderMark draws, as an <svg> React can place:
// aria-hidden, focusable="false", data-mark={id} — the words beside it say
// the same thing and are its accessible name. An unknown id renders
// nothing, so a surface degrades to its words. `style` places it (a
// flex-shrink, a margin); without one its markup is renderMark's, byte for
// byte once a browser has parsed it.
//
// The printed marks take currentColor — ink on cream; set `color` on the
// parent for cream inside a filled circle or burgundy inside an outline
// one. The pencil marks are always burgundy: the pencil is only ever the
// user's. No hooks, so a server component can render one too.

import { markBody, markSize } from "./marks";

// One { __html } per id for the life of the page: a new object on every
// render would have React re-apply the markup each time
const BODIES = new Map();

export default function Mark({ id, size = 20, style }) {
  const mark = markBody(id);
  if (!mark) return null;
  if (!BODIES.has(id)) BODIES.set(id, { __html: mark.body });
  const px = markSize(size);
  return (
    <svg
      viewBox={mark.viewBox} width={px} height={px} aria-hidden="true" focusable="false" data-mark={id}
      style={style} dangerouslySetInnerHTML={BODIES.get(id)}
    />
  );
}
