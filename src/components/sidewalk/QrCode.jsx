export default function QrCode({ value, size = 220 }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
    value
  )}&margin=0&bgcolor=ffffff`;
  return (
    <div className="rounded-2xl bg-white p-3 border border-stone-200 shadow-sm inline-block">
      <img
        src={src}
        width={size}
        height={size}
        alt="QR code to open the vendor app"
        className="rounded-lg block"
      />
    </div>
  );
}