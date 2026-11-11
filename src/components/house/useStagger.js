// useStagger — hands each sibling its entrance delay
// (docs/motion/README.md §6):
//
//   const next = useStagger(300);            // ROW_STEP apart, from 300ms
//   {showA && <WineRow enterDelay={next()} … />}
//   {showB && <WineRow enterDelay={next()} … />}
//
// Like numeralCounter() for numerals: call next() inside a row's own
// condition, so a row that doesn't render takes no slot and leaves no gap
// in the rhythm. A fresh count every render — an entrance reads its delay
// only when it mounts, so the same row gets the same answer each time.
// Pure, so it also runs in plain node.

import { ROW_STEP } from "./motion.js";

export default function useStagger(base = 0, step = ROW_STEP) {
  let index = 0;
  return function next() {
    return base + step * index++;
  };
}
