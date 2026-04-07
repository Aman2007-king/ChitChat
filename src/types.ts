export interface User {
  id: string;
  name: string;
  avatar: string;
  status: string;
  phoneNumber?: string;
  lastSeen?: string;
  isOnline?: boolean;
  isAI?: boolean;
  personality?: string;
  privacy?: {
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    status: 'everyone' | 'contacts' | 'nobody';
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  audioUrl?: string;
  type: 'text' | 'audio';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
  reactions?: { [emoji: string]: string[] }; // emoji -> list of userIds
}

export interface Chat {
  id: string;
  name?: string;
  avatar?: string;
  participants: User[];
  isGroup?: boolean;
  lastMessage?: Message;
  unreadCount: number;
}
