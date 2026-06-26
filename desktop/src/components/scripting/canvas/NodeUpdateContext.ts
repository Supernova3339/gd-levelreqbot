// Shared context so ScriptNode can update its own data in the parent NodeCanvas
// without putting functions inside ReactFlow's data object (which breaks memoization).

import {createContext, useContext} from "react";
import type {ScriptNodeData} from "./NodeDefinitions";

type UpdateFn = (nodeId: string, patch: Partial<ScriptNodeData>) => void;

export const NodeUpdateContext = createContext<UpdateFn>(() => {
});
export const useNodeUpdate = () => useContext(NodeUpdateContext);
