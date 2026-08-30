import { extractYaml } from '@std/front-matter/yaml';

const modules = import.meta.glob('/src/md/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function getAllPosts() {
  return Object.entries(modules).map(([path, raw]) => {
    const { attrs, body } = extractYaml(raw);
    const slug = path.split('/').pop()!.replace(/\.md$/, '');
    return { slug, meta: attrs as Record<string, string>, content: body };
  });
}

export function getPostBySlug(slug: string) {
  return getAllPosts().find((p) => p.slug === slug);
}