export interface User {
  id: string;
  name: string;
  avatar: string;
  status: string;
  phoneNumber?: string;
  lastSeen?: string;
  isOnline?: boolean;
  isAI?: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface Chat {
  id: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
}
