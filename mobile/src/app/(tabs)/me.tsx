import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ProfileView } from '../../components/ProfileView';
import { Button, Empty } from '../../components/ui';
import { tr } from '../../lib/i18n';

export default function MeScreen() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Empty title={tr('加入 YourWowAI', 'Join YourWowAI')} message={tr('登入後就能分享你用 AI 打造的工具、追蹤其他創作者。', 'Sign in to share the tools you build with AI and follow other builders.')}>
        <Button title={tr('登入或註冊', 'Sign in or sign up')} variant="primary" onPress={() => router.push('/login')} />
      </Empty>
    );
  }
  return <ProfileView username={user.username} />;
}
