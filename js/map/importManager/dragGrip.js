export function makeDragGrip(grip, input, min, max, step, onUpdate, onRelease) {
  const PX_PER_STEP = 4;
  let startX = 0;
  let startVal = 0;

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startX = e.clientX;
    startVal = parseFloat(input.value) || min;
    grip.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const steps = Math.round((ev.clientX - startX) / PX_PER_STEP);
      let newVal = startVal + steps * step;
      newVal = Math.max(min, Math.min(max, Math.round(newVal / step) * step));
      if (parseFloat(input.value) !== newVal) {
        input.value = newVal;
        onUpdate(newVal);
      }
    };

    const onUp = () => {
      grip.releasePointerCapture(e.pointerId);
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      if (onRelease) onRelease();
    };

    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
  });
}
