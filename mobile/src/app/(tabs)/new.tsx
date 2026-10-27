import { useState } from 'react';
import { router } from 'expo-router';
import { uploadPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { tr } from '../../lib/i18n';
import { Button, Empty } from '../../components/ui';
import { PostEditor } from '../../components/PostEditor';

export default function NewPostScreen() {
  const { user } = useAuth();
  // 分享成功後換 key，讓表單回到空白
  const [formKey, setFormKey] = useState(0);

  if (!user) {
    return (
      <Empty title={tr('分享你的 AI 工具', 'Share your AI tool')} message={tr('登入後就能附上截圖或 YouTube 影片，分享你用 AI 打造的作品。', 'Sign in to share what you built with AI, with screenshots or a YouTube demo.')}>
        <Button title={tr('登入或註冊', 'Sign in or sign up')} variant="primary" onPress={() => router.push('/login')} />
      </Empty>
    );
  }

  return (
    <PostEditor
      key={formKey}
      submitLabel={tr('分享', 'Share')}
      onSubmit={uploadPost}
      onDone={(post) => {
        setFormKey((k) => k + 1);
        router.push(`/post/${post.id}`);
      }}
    />
  );
}
