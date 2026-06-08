type PatchedNodePrototype = Node & {
  __biofisioBrowserTranslateCompatPatched?: boolean;
};

const isNotFoundError = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError";

const findDirectChildContaining = (parent: Node, node: Node) => {
  let current: Node | null = node;

  while (current?.parentNode && current.parentNode !== parent) {
    current = current.parentNode;
  }

  return current?.parentNode === parent ? current : null;
};

export function installBrowserTranslateCompat() {
  if (typeof window === "undefined" || typeof Node === "undefined") return;

  const nodePrototype = Node.prototype as PatchedNodePrototype;
  if (nodePrototype.__biofisioBrowserTranslateCompatPatched) return;

  const originalRemoveChild = nodePrototype.removeChild;
  const originalInsertBefore = nodePrototype.insertBefore;
  const originalAppendChild = nodePrototype.appendChild;

  nodePrototype.removeChild = function <T extends Node>(
    this: Node,
    child: T,
  ): T {
    try {
      return originalRemoveChild.call(this, child) as T;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;

      if (child.parentNode && this.contains(child)) {
        return originalRemoveChild.call(child.parentNode, child) as T;
      }

      return child;
    }
  } as typeof Node.prototype.removeChild;

  nodePrototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    try {
      return originalInsertBefore.call(this, newNode, referenceNode) as T;
    } catch (error) {
      if (!isNotFoundError(error) || !referenceNode) throw error;

      const translatedAnchor = findDirectChildContaining(this, referenceNode);

      if (translatedAnchor) {
        return originalInsertBefore.call(this, newNode, translatedAnchor) as T;
      }

      return originalAppendChild.call(this, newNode) as T;
    }
  } as typeof Node.prototype.insertBefore;

  nodePrototype.__biofisioBrowserTranslateCompatPatched = true;
}
