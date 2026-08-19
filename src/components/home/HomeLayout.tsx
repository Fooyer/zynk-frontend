import { useFriendStore } from '../../stores/friendStore';
import { DMSidebar } from './DMSidebar';
import { FriendsPage } from './FriendsPage';
import { DMChatArea } from './DMChatArea';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';

interface HomeLayoutProps {
  voice: ReturnType<typeof useVoiceRoom>;
}

export function HomeLayout({ voice }: HomeLayoutProps) {
  const activeDmChannelId = useFriendStore((s) => s.activeDmChannelId);
  const dmChannels = useFriendStore((s) => s.dmChannels);

  const activeDm = activeDmChannelId
    ? dmChannels.find((d) => d.channelId === activeDmChannelId)
    : null;

  return (
    <div className="flex-1 flex overflow-hidden">
      <DMSidebar voice={voice} />
      {activeDm ? <DMChatArea dm={activeDm} /> : <FriendsPage />}
    </div>
  );
}
