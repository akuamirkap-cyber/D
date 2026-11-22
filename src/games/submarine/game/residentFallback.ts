const textures = new Map<string, HTMLImageElement>();

export function bakedTexture(name: string) {
  let img = textures.get(name);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = `/images/baked/${name}.webp`;
    textures.set(name, img);
    if (textures.size > 24) textures.delete(textures.keys().next().value!);
  } else {
    textures.delete(name);
    textures.set(name, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

const beams: (HTMLCanvasElement | undefined)[] = [];
export function searchlight(cool = false) {
  const key = Number(cool);
  if (beams[key]) return beams[key]!;
  const beam = document.createElement("canvas");
  beam.width = 192;
  beam.height = 80;
  const c = beam.getContext("2d")!;
  const image = c.createImageData(192, 80);
  for (let x = 0; x < 192; x++) {
    for (let y = 0; y < 80; y++) {
      const u = 1 - x / 191;
      const v = (y - 38 - u * 4) / (2 + u * 22);
      const i = (y * 192 + x) * 4;
      image.data[i] = cool ? 177 : 255;
      image.data[i + 1] = cool ? 226 : 222;
      image.data[i + 2] = cool ? 251 : 151;
      image.data[i + 3] = (cool ? 147 : 168) * (1 - u) ** 1.42 * Math.exp(-v * v * 1.05);
    }
  }
  c.putImageData(image, 0, 0);
  beams[key] = beam;
  return beam;
}
