import Link from "next/link";
import { Win } from "@/components/ui";
import { MASTER_CONFIGS, MASTER_ORDER } from "@/components/masterConfigs";

/**
 * Master data is the actual asset here. The formula is easy to copy; a library
 * of components, rates and site factors that reflects how Build Play really
 * works is not.
 */
export default function MasterIndexPage() {
  return (
    <Win title="Master data">
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Build these out in order. Customers, manufacturers, vendors, equipment and labor rates first — an
        estimate cannot be priced without them. Components and presets next. Rules last, once you have jobs
        to tell you what the rules should say.
      </p>
      <div className="split-3">
        {MASTER_ORDER.map((key) => (
          <Link key={key} href={`/master/${key}`} className="price-tier" style={{ textDecoration: "none" }}>
            <div className="tier-name">{MASTER_CONFIGS[key].title}</div>
            <div className="small-text muted" style={{ marginTop: 6 }}>
              {MASTER_CONFIGS[key].intro?.slice(0, 90)}…
            </div>
          </Link>
        ))}
      </div>
    </Win>
  );
}
