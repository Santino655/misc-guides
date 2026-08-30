import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getPostBySlug } from '../lib/posts.ts';

export default function PostPage() {
  const { slug } = useParams();
  const post = getPostBySlug(slug!);

  if (!post) return <p>No encontrado</p>;

  return (
    <article>
      <h1>post.meta.title</h1>
      <ReactMarkdown>{post.content}</ReactMarkdown>
    </article>
  );
}