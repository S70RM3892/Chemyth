type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) el.className = cls as string;
  Object.assign(el, rest);
  for (const c of children) if (c) el.append(c);
  return el;
}

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
