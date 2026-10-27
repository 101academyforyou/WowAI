import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api, updatePost, type Post } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { tr } from '../../lib/i18n';
import { Empty, Loading } from '../../components/ui';
import { PostEditor } from '../../components/PostEditor';

// 編輯自己的貼文
export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ post: Post }>(`/api/posts/${id}`).then((r) => setPost(r.post)).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <Empty title={tr('糟糕', 'Oops')} message={error} />;
  if (!post) return <Loading />;
  if (!user || post.author.id !== user.id) {
    return <Empty title={tr('無法編輯', "Can't edit")} message={tr('只能編輯自己的貼文。', 'You can only edit your own posts.')} />;
  }

  return (
    <PostEditor
      initial={post}
      submitLabel={tr('儲存變更', 'Save changes')}
      onSubmit={(fields, media, onProgress) => updatePost(post.id, fields, media, onProgress)}
      onDone={() => (router.canGoBack() ? router.back() : router.replace(`/post/${post.id}`))}
    />
  );
}
