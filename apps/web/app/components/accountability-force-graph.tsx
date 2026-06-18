"use client";

import ForceGraph3D, { type ForceGraphMethods, type ForceGraphProps } from "react-force-graph-3d";
import type { MutableRefObject } from "react";
import type { AccountabilityGraphLink, AccountabilityGraphNode } from "../lib/accountability-graph";

export type AccountabilityForceGraphHandle = ForceGraphMethods<AccountabilityGraphNode, AccountabilityGraphLink>;
export type AccountabilityForceGraphProps = ForceGraphProps<AccountabilityGraphNode, AccountabilityGraphLink> & {
  graphRef?: MutableRefObject<AccountabilityForceGraphHandle | undefined>;
};

export function AccountabilityForceGraph({ graphRef, ...props }: AccountabilityForceGraphProps) {
  return <ForceGraph3D ref={graphRef} {...props} />;
}
