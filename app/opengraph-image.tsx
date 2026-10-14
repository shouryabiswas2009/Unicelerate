import { ImageResponse } from "next/og";
import { markSvg } from "@/components/brand/mark";
import { BRAND_NAME } from "@/lib/brand";

// The preview image shown when a link to the site is shared (Open Graph).
// Generated at build time from the logo mark and the brand name.
export const alt = `${BRAND_NAME}: find the university that actually fits you`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#1e4d3a";
const BAND = "#163a2c";
const CREAM = "#f7f4ec";

export default function OpengraphImage() {
  const mark = `data:image/svg+xml;base64,${Buffer.from(markSvg(CREAM, { size: 120 })).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: CREAM, color: "#14231c" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px" }}>
          <div style={{ fontSize: 30, letterSpacing: 6, color: GREEN, textTransform: "uppercase" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 24, display: "flex", flexWrap: "wrap" }}>
            Find the university that actually&nbsp;<span style={{ color: GREEN }}>fits you.</span>
          </div>
          <div style={{ fontSize: 30, marginTop: 28, color: "#56635c" }}>
            Official US figures and fees checked on each university&apos;s own website.
          </div>
        </div>
        <div style={{ width: 360, background: BAND, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <img src={mark} width={180} height={180} alt="" />
          <div style={{ marginTop: 24, fontSize: 40, color: CREAM }}>{BRAND_NAME}</div>
        </div>
      </div>
    ),
    size
  );
}
