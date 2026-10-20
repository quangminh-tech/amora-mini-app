import React from "react";
export const noteLayers = [
  {
    key: "top",
    field: "top_notes",
    label: "Hương đầu",
    english: "TOP",
    description: "Ấn tượng mở đầu",
    tone: "#d9c28d",
  },
  {
    key: "middle",
    field: "middle_notes",
    label: "Hương giữa",
    english: "HEART",
    description: "Nét hương chính",
    tone: "#b88072",
  },
  {
    key: "base",
    field: "base_notes",
    label: "Hương cuối",
    english: "BASE",
    description: "Nền hương và dư âm",
    tone: "#713342",
  },
] as const;
// A schematic illustration, not a formula, concentration or a burn-time chart.
export function LayerIllustration({ layer }: { layer: string }) {
  const index = noteLayers.findIndex((x) => x.key === layer);
  return (
    <svg
      className="sn-layer-art"
      viewBox="0 0 240 150"
      role="img"
      aria-label={"Minh họa " + (noteLayers[index]?.label || "tầng hương")}
    >
      <path d="M120 12 223 137H17Z" fill="#f0e6d9" />
      <path d="M120 12 151 50H89Z" fill={index === 0 ? "#d9c28d" : "#e8dcc8"} />
      <path
        d="M85 55h70l32 39H53Z"
        fill={index === 1 ? "#b88072" : "#e8dcc8"}
      />
      <path
        d="M49 99h142l32 38H17Z"
        fill={index === 2 ? "#713342" : "#e8dcc8"}
      />
      <circle
        cx="120"
        cy={[36, 75, 119][index] || 36}
        r="5"
        fill={index === 2 ? "#fff" : "#713342"}
      />
    </svg>
  );
}
export function ScentNotes({
  top,
  middle,
  base,
  name,
}: {
  top?: string;
  middle?: string;
  base?: string;
  name?: string;
}) {
  if (!top && !middle && !base) return null;
  const values = [top, middle, base];
  return (
    <section className="sn-notes">
      <h3>{name ? "Tầng hương · " + name : "Tầng hương"}</h3>
      <div className="sn-note-grid">
        {noteLayers.map((layer, i) => (
          <article key={layer.key}>
            <LayerIllustration layer={layer.key} />
            <small>{layer.english}</small>
            <h4>{layer.label}</h4>
            <p>{values[i] || "Chưa có dữ liệu được xác nhận."}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
