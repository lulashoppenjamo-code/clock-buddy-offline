export type GeoResult =
  | { ok: true; position: GeolocationPosition }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" | "insecure" };

export function getPosition(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return resolve({ ok: false, reason: "unsupported" });
    }
    // Geolocation only works on HTTPS or localhost
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      return resolve({ ok: false, reason: "insecure" });
    }

    let settled = false;
    const finish = (r: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    // First try: high accuracy with longer timeout
    navigator.geolocation.getCurrentPosition(
      (p) => finish({ ok: true, position: p }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          return finish({ ok: false, reason: "denied" });
        }
        // Fallback: low accuracy, allow cached
        navigator.geolocation.getCurrentPosition(
          (p) => finish({ ok: true, position: p }),
          (err2) => {
            if (err2.code === err2.PERMISSION_DENIED) finish({ ok: false, reason: "denied" });
            else if (err2.code === err2.TIMEOUT) finish({ ok: false, reason: "timeout" });
            else finish({ ok: false, reason: "unavailable" });
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function geoReasonMessage(reason: Exclude<GeoResult, { ok: true }>["reason"]) {
  switch (reason) {
    case "denied":
      return "Permiso de ubicación denegado. Actívalo en los ajustes del navegador.";
    case "unsupported":
      return "Este dispositivo no soporta geolocalización.";
    case "insecure":
      return "La ubicación requiere una conexión segura (HTTPS).";
    case "timeout":
      return "No se pudo obtener la ubicación (tiempo agotado). Revisa que el GPS esté activado.";
    case "unavailable":
    default:
      return "No se pudo obtener la ubicación. Activa el GPS e inténtalo de nuevo.";
  }
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
