import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { ProfileView } from '../../components/ProfileView';
import { Button, Empty } from '../../components/ui';

export default function MeScreen() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Empty title="加入 WowAI" message="登入後就能分享你用 AI 打造的工具、追蹤其他創作者。">
        <Button title="登入或註冊" variant="primary" onPress={() => router.push('/login')} />
      </Empty>
    );
  }
  return <ProfileView username={user.username} />;
}
