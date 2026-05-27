import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-images";

function loadStore() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

function saveStore(store) {
  storageSet(KEY, store);
}

function resizeToDataUrl(file, maxPx = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round(height * maxPx / width);
          width = maxPx;
        } else {
          width = Math.round(width * maxPx / height);
          height = maxPx;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export async function storeImage(file) {
  const dataUrl = await resizeToDataUrl(file);
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const store = loadStore();
  store[id] = { dataUrl, filename: file.name, createdAt: new Date().toISOString() };
  saveStore(store);
  return id;
}

export function storeImageFromDataUrl(dataUrl, filename = "image.jpg") {
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const store = loadStore();
  store[id] = { dataUrl, filename, createdAt: new Date().toISOString() };
  saveStore(store);
  return id;
}

export function deleteStoredImage(id) {
  const store = loadStore();
  delete store[id];
  saveStore(store);
}

export function getImages(ids) {
  if (!ids || ids.length === 0) return [];
  const store = loadStore();
  return ids
    .map(id => (store[id] ? { id, ...store[id] } : null))
    .filter(Boolean);
}
