import matter from 'gray-matter';

const modules = import.meta.glob('/src/md/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function getAllPosts() {
  return Object.entries(modules).map(([path, raw]) => {
    const { data, content } = matter(raw);
    const slug = path.split('/').pop()!.replace(/\.md$/, '');
    return { slug, meta: data, content };
  });
}

export function getPostBySlug(slug: string) {
  return getAllPosts().find((p) => p.slug === slug);
}