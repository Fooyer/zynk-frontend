import { useFriendStore } from '../../stores/friendStore';
import { DMSidebar } from './DMSidebar';
import { FriendsPage } from './FriendsPage';
import { DMChatArea } from './DMChatArea';

export function HomeLayout() {
  const activeDmChannelId = useFriendStore((s) => s.activeDmChannelId);
  const dmChannels = useFriendStore((s) => s.dmChannels);

  const activeDm = activeDmChannelId
    ? dmChannels.find((d) => d.channelId === activeDmChannelId)
    : null;

  return (
    <div className="flex-1 flex overflow-hidden">
      <DMSidebar />
      {activeDm ? <DMChatArea dm={activeDm} /> : <FriendsPage />}
    </div>
  );
}
