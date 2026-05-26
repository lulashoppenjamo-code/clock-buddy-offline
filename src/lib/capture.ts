export function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export function captureFromFileInput(file: File): Promise<Blob> {
  // Downscale to ~720px max dimension and re-encode as JPEG for size.
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 720;
      let { width, height } = img;
      if (width > height && width > max) {
        height = Math.round((height * max) / width);
        width = max;
      } else if (height > max) {
        width = Math.round((width * max) / height);
        height = max;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("no canvas ctx"));
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error("blob fail"));
          resolve(blob);
        },
        "image/jpeg",
        0.78,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img load fail"));
    };
    img.src = url;
  });
}

export function deviceLabel() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "Web";
}
