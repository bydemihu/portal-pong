// js for the game interface. main game script/state manager!!!

const word = document.getElementById("wave");
const text = word.textContent;
word.textContent = "";

const root = document.documentElement;
const pongGreen = getComputedStyle(root).getPropertyValue('--pong-green').trim();
const pongBlue = getComputedStyle(root).getPropertyValue('--pong-blue').trim();
const coloredIndices = [1,8]; // color pOrtal pOng
const colors = [pongGreen, pongBlue]; // colors for those letters

const letters = text.split("").map((char, i) => {
  const span = document.createElement("span");
  span.textContent = char;
  span.textContent = char === " " ? "\u00A0" : char;
  span.style.display = "inline-block";
  span.style.transform = "translateY(0px)";

  const colorIndex = coloredIndices.indexOf(i);
  if (colorIndex !== -1) {
    span.style.color = colors[colorIndex];
  }

  word.appendChild(span);
  return span;
});

let t = 0;
function animateWave() {
  letters.forEach((span, i) => {
    const y = Math.sin((t + i) * 0.3) * 4; 
    span.style.transform = `translateY(${y}px)`;
  });
  t += 0.5;
  requestAnimationFrame(animateWave);
}

animateWave();