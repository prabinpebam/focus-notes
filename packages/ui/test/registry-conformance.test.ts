/**
 * Contract-to-component parity is a compile-time guarantee (DS-A05, D-199). Each `@ts-expect-error`
 * below is an incompatible change to Button that `pnpm typecheck` must reject: if the registry
 * stopped catching it, the directive would be unused and typecheck would fail. Nothing renders.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { defineRegistry, type ContractProps, type Mismatch } from "../src/register.ts";
import { Button, type ButtonProps } from "../src/primitives/Button/Button.tsx";
import { contract } from "../src/primitives/Button/contract.ts";
import { registry } from "../src/registry.ts";

type ButtonContract = typeof contract;
type Without<K extends keyof ButtonProps> = Omit<ButtonProps, K>;

// Incompatible Buttons, as types only: never called.
declare const LabelRenamed: (p: Without<"label"> & { text: string }) => null;
declare const OptionalRenamed: (p: Without<"variant"> & { tone?: ButtonProps["variant"] }) => null;
declare const BusyRetyped: (p: Without<"busy"> & { busy?: "yes" | "no" }) => null;
declare const VariantNarrowed: (p: Without<"variant"> & { variant?: "primary" | "secondary" }) => null;
declare const LabelAsReference: (p: Without<"label"> & { label: { t: string } }) => null;
declare const EventRenamed: (p: Without<"onPress"> & { onActivate?: () => void }) => null;
declare const EventNeedsValue: (p: Without<"onPress"> & { onPress?: (value: number) => void }) => null;
declare const NewRequiredProp: (p: ButtonProps & { tooltip: string }) => null;

describe("registering a component checks its props against its contract (D-199)", () => {
  it("accepts the real Button, and every registered component conforms", () => {
    expectTypeOf<Mismatch<ButtonContract, ButtonProps>>().toBeNever();
    expect(defineRegistry({ Button }).Button).toBe(Button);
    expect(registry.Button).toBe(Button);
  });

  it("passes runtime values: a message prop is the resolved string, never an authored reference", () => {
    expectTypeOf<ContractProps<ButtonContract>["label"]>().toEqualTypeOf<string>();
    expectTypeOf<ContractProps<ButtonContract>["variant"]>().toEqualTypeOf<"primary" | "secondary" | "subtle" | "danger" | undefined>();
  });

  it("rejects incompatible prop changes at compile time", () => {
    const changes = [
      // @ts-expect-error: a required prop renamed (label → text).
      () => defineRegistry({ Button: LabelRenamed }),
      // @ts-expect-error: an optional prop renamed (variant → tone).
      () => defineRegistry({ Button: OptionalRenamed }),
      // @ts-expect-error: a prop's type changed (busy: boolean → "yes" | "no").
      () => defineRegistry({ Button: BusyRetyped }),
      // @ts-expect-error: an enum the component no longer takes every value of.
      () => defineRegistry({ Button: VariantNarrowed }),
      // @ts-expect-error: a message prop typed as the authored reference instead of the resolved string.
      () => defineRegistry({ Button: LabelAsReference }),
      // @ts-expect-error: an event's handler renamed (onPress → onActivate).
      () => defineRegistry({ Button: EventRenamed }),
      // @ts-expect-error: an event adapter that expects a value the contract's payload doesn't carry.
      () => defineRegistry({ Button: EventNeedsValue }),
      // @ts-expect-error: a required prop the contract never sets.
      () => defineRegistry({ Button: NewRequiredProp }),
      // @ts-expect-error: a key that names no contract.
      () => defineRegistry({ Buton: Button }),
    ];
    expect(changes).toHaveLength(9);
  });

  it("rejects a contract change the component doesn't follow", () => {
    type Widened = Omit<ButtonContract, "props"> & { props: Omit<ButtonContract["props"], "variant"> & { variant: { kind: "enum"; values: readonly ["primary", "ghost"] } } };
    expectTypeOf<Mismatch<Widened, ButtonProps>>().not.toBeNever();
    type Added = Omit<ButtonContract, "props"> & { props: ButtonContract["props"] & { tone: { kind: "text" } } };
    expectTypeOf<Mismatch<Added, ButtonProps>>().not.toBeNever();
  });
});
