import { Icon } from "../Icon/Icon.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import { LiveRegion } from "../LiveRegion/LiveRegion.tsx";
import type { ScanTarget } from "../../data.ts";
import { ICON_NAMES, type IconName } from "../../icon-names.ts";
import * as s from "./ScanRadar.css.ts";

export interface ScanRadarProps {
  /** What it's doing, its accessible name: "Looking for AI models on this computer". */
  label: string;
  phase?: "scanning" | "found" | "none" | "error";
  /** One row per place asked, each settling the moment its answer arrives (never held back to look busy). */
  targets: ScanTarget[];
  /** The live count beside the radar: "Found 2 so far", "Found 3 apps", "Nothing running". */
  count: string;
  /** Read out with each row that's still waiting: "Checking". */
  checkingLabel: string;
  announceResult?: boolean;
}

const iconOf = (name: string | undefined): IconName => ((ICON_NAMES as readonly string[]).includes(name ?? "") ? name as IconName : "sparkle");
const prop = (ref: string) => ref.slice(4, -1);

/**
 * The scan for AI models on this computer (IA-CMP-AIDISCOVER, DD-RWR-12): a radar sweeps while the
 * app asks, every place that answers lands as a blip on its own bearing, and one row per place says
 * what was asked and what came back. Reduced motion: no sweep and no pulse; rows and blips just appear.
 */
export function ScanRadar({ label, phase = "scanning", targets, count, checkingLabel, announceResult = true }: ScanRadarProps) {
  const n = Math.max(targets.length, 1);
  return (
    <div className={s.root} role="group" aria-busy={phase === "scanning"} aria-label={label}>
      <div className={s.radar} data-phase={phase} aria-hidden="true">
        <span className={s.sweep} />
        {targets.map((target, i) => target.status === "found" ? (
          <span key={target.id} className={s.blip} style={{ [prop(s.angle)]: `${(i + 0.5) / n}turn` }} />
        ) : null)}
        <span className={s.core}><Icon name="hardDrive" size="l" /></span>
      </div>
      <div className={s.side}>
        <span className={s.count}>{count}</span>
        {announceResult ? <LiveRegion message={phase === "scanning" ? "" : count} /> : null}
        <ul className={s.list}>
          {targets.map((target) => (
            <li key={target.id} className={s.row} data-status={target.status}>
              <span className={s.rowIcon}><Icon name={iconOf(target.icon)} /></span>
              <span className={s.name}>
                <span>{target.label}</span>
                {target.detail ? <span className={s.detail}>{target.detail}</span> : null}
              </span>
              <span className={s.result}>{target.status === "checking" ? checkingLabel : target.result ?? ""}</span>
              <span className={`${s.mark} ${s.markTone[target.status as keyof typeof s.markTone] ?? s.markTone.none}`} key={target.status}>
                {target.status === "checking" ? <Spinner size="s" /> : target.status === "found" ? <Icon name="check" size="s" /> : target.status === "error" ? <Icon name="warning" size="s" /> : <Icon name="circle" size="s" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
