import { Link } from 'react-router-dom';
import { getAllPosts } from '../lib/posts.ts';

// here test linker along criteria with github in cat-folder link must be coincided with Route and route with one
// path
export default function PostList() {
  const posts = getAllPosts()
    .sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime());

  return (
    <div>
      <h1>Posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link to={`/posts/${post.slug}`}>{post.meta.title}</Link>
            {post.meta.date && <span> — {post.meta.date}</span>}
            {post.meta.excerpt && <p>{post.meta.excerpt}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}