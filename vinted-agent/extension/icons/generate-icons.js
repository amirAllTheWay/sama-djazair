// Run with: node generate-icons.js
// Requires: npm install canvas
// Generates PNG icons at 16x16, 32x32, 48x48, 128x128

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];

sizes.forEach((size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background gradient circle
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#1d6fa4");
  grad.addColorStop(1, "#09c");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Robot emoji-like face
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(size * 0.6)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🤖", size / 2, size / 2 + 1);

  const buffer = canvas.toBuffer("image/png");
  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated ${outPath}`);
});
