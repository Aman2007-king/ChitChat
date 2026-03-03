import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Search, 
  MoreVertical, 
  MessageSquare, 
  Phone, 
  Video, 
  Paperclip, 
  Smile, 
  Mic, 
  Send,
  Check,
  CheckCheck,
  User as UserIcon,
  Settings,
  CircleDashed,
  LogOut,
  Trash2,
  ChevronLeft,
  Edit2,
  X,
  UserCircle,
  Info,
  Moon,
  Sun,
  Users,
  Plus
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { User, Message, Chat } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<'phone' | 'otp' | 'complete'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [showProfile, setShowProfile] = useState<User | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editType, setEditType] = useState<'status' | 'personality' | 'name' | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize user and theme from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('wa_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setLoginStep('complete');
    }

    const savedTheme = localStorage.getItem('wa_theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('wa_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('wa_theme', 'light');
    }
  };

  // Fetch users and chats
  useEffect(() => {
    if (!currentUser) return;

    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.filter((u: User) => u.id !== currentUser.id)));

    fetch(`/api/chats/${currentUser.id}`)
      .then(res => res.json())
      .then(data => setChats(data));
  }, [currentUser]);

  // Socket setup
  useEffect(() => {
    if (!currentUser) return;

    socketRef.current = io();

    socketRef.current.on('receive-message', (message: Message) => {
      if (activeChat && message.chatId === activeChat.id) {
        setMessages(prev => [...prev, message]);
      }
      
      setChats(prev => prev.map(c => 
        c.id === message.chatId ? { ...c, lastMessage: message } : c
      ));

      // Browser Notification
      if (document.hidden && message.senderId !== currentUser?.id) {
        const sender = users.find(u => u.id === message.senderId)?.name || 'New Message';
        new Notification(sender, {
          body: message.text,
          icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg'
        });
      }
    });

    socketRef.current.on('user-typing', (data: { userId: string, isTyping: boolean }) => {
      if (activeChat?.participants.some(p => p.id === data.userId)) {
        setRemoteTyping(data.isTyping ? data.userId : null);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [currentUser, activeChat]);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (!activeChat) return;

    socketRef.current?.emit('join-chat', activeChat.id);

    fetch(`/api/messages/${activeChat.id}`)
      .then(res => res.json())
      .then(data => setMessages(data));
  }, [activeChat]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginStep === 'phone') {
      // Simulate sending OTP
      setLoginStep('otp');
    } else if (loginStep === 'otp') {
      // Simulate OTP verification
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          name: `User ${phoneNumber.slice(-4)}`,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phoneNumber}`,
        }),
      });
      const user = await res.json();
      setCurrentUser(user);
      localStorage.setItem('wa_user', JSON.stringify(user));
      setLoginStep('complete');
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (!isTyping && activeChat) {
      setIsTyping(true);
      socketRef.current?.emit('typing', { chatId: activeChat.id, userId: currentUser?.id, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing', { chatId: activeChat.id, userId: currentUser?.id, isTyping: false });
    }, 2000);
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChat || !currentUser) return;

    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      chatId: activeChat.id,
      senderId: currentUser.id,
      text: inputText,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    const recipientId = activeChat.participants[0].id;

    socketRef.current?.emit('send-message', { ...newMessage, recipientId });
    setInputText('');
    setIsTyping(false);
    socketRef.current?.emit('typing', { chatId: activeChat.id, userId: currentUser?.id, isTyping: false });
  };

  const deleteMessage = async (messageId: string) => {
    await fetch(`/api/messages/${messageId}`, { method: 'DELETE' });
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const updateUserProfile = async (userId: string, data: Partial<User>) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updatedUser = await res.json();
    
    if (userId === currentUser?.id) {
      setCurrentUser(updatedUser);
      localStorage.setItem('wa_user', JSON.stringify(updatedUser));
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      if (activeChat?.participants.some(p => p.id === userId)) {
        setActiveChat(prev => prev ? { ...prev, participants: [updatedUser] } : null);
      }
    }
    setShowProfile(updatedUser);
    setIsEditingProfile(false);
  };

  const startChat = (otherUser: User) => {
    const existingChat = chats.find(c => 
      !c.isGroup && c.participants.some(p => p.id === otherUser.id)
    );

    if (existingChat) {
      setActiveChat(existingChat);
    } else {
      const newChat: Chat = {
        id: [currentUser?.id, otherUser.id].sort().join('-'),
        participants: [otherUser],
        unreadCount: 0,
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat);
    }
    setSearchQuery('');
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedContacts.length === 0) return;

    const participants = [...selectedContacts, currentUser?.id];
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupName,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${groupName}`,
        participants,
        isGroup: true
      }),
    });
    const newChat = await res.json();
    setChats(prev => [newChat, ...prev]);
    setActiveChat(newChat);
    setShowNewGroup(false);
    setGroupName('');
    setSelectedContacts([]);
  };

  if (loginStep !== 'complete') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#f0f2f5]">
        <div className="w-[450px] bg-white p-10 rounded-lg shadow-lg text-center">
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" 
            alt="WhatsApp" 
            className="w-20 mx-auto mb-8"
          />
          <h1 className="text-2xl font-light text-[#41525d] mb-6">
            {loginStep === 'phone' ? 'Enter your phone number' : 'Enter the OTP'}
          </h1>
          <form onSubmit={handleLogin} className="space-y-6">
            {loginStep === 'phone' ? (
              <input 
                type="tel" 
                placeholder="+1 234 567 890" 
                className="w-full border-b-2 border-[#00a884] py-2 outline-none text-xl text-center"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
              />
            ) : (
              <input 
                type="text" 
                placeholder="123456" 
                className="w-full border-b-2 border-[#00a884] py-2 outline-none text-xl text-center tracking-widest"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            )}
            <button 
              type="submit"
              className="w-full bg-[#00a884] text-white py-3 rounded-md font-medium hover:bg-[#008f6f] transition-colors"
            >
              {loginStep === 'phone' ? 'NEXT' : 'VERIFY'}
            </button>
          </form>
          {loginStep === 'otp' && (
            <button 
              onClick={() => setLoginStep('phone')}
              className="mt-4 text-[#00a884] text-sm font-medium"
            >
              Change Phone Number
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#f0f2f5] overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="flex flex-col w-[400px] border-r border-[#d1d7db] dark:border-[#2f3b43] bg-white dark:bg-[#111b21]">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f5] dark:bg-[#202c33] h-[60px]">
          <div 
            className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 cursor-pointer"
            onClick={() => setShowProfile(currentUser)}
          >
            <img src={currentUser?.avatar} alt="Me" className="w-full h-full object-cover" loading="lazy" />
          </div>
          <div className="flex items-center gap-5 text-[#54656f] dark:text-[#aebac1]">
            <CircleDashed 
              className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" 
              title="Status"
              onClick={() => {
                setShowProfile(currentUser);
                setEditType('status');
                setEditValue(currentUser?.status || '');
                setIsEditingProfile(true);
              }}
            />
            <button onClick={toggleDarkMode} title="Toggle Theme">
              {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>
            <MessageSquare 
              className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" 
              title="New Chat"
              onClick={() => {
                const searchInput = document.querySelector('input[placeholder="Search or start new chat"]') as HTMLInputElement;
                searchInput?.focus();
              }}
            />
            <Plus 
              className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" 
              title="New Group"
              onClick={() => setShowNewGroup(true)}
            />
            <MoreVertical className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" title="Menu" />
          </div>
        </div>

        {/* Search */}
        <div className="p-2 bg-white dark:bg-[#111b21]">
          <div className="flex items-center bg-[#f0f2f5] dark:bg-[#202c33] rounded-lg px-3 py-1.5">
            <Search className="w-5 h-5 text-[#54656f] dark:text-[#aebac1] mr-4" />
            <input 
              type="text" 
              placeholder="Search or start new chat" 
              className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] dark:text-[#e9edef]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#111b21]">
          {searchQuery ? (
            <div className="py-2">
              <div className="px-4 py-3 text-[#008069] dark:text-[#00a884] text-sm font-medium uppercase tracking-wider">
                Contacts
              </div>
              {users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                  <div 
                    key={user.id}
                    onClick={() => startChat(user)}
                    className="flex items-center px-4 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] cursor-pointer transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden mr-4">
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="flex-1 border-b border-[#f0f2f5] dark:border-[#2f3b43] pb-3">
                      <div className="font-medium text-[#111b21] dark:text-[#e9edef]">{user.name}</div>
                      <div className="text-sm text-[#667781] dark:text-[#8696a0] truncate">{user.status}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-[#667781] dark:text-[#8696a0] text-sm">
                  No contacts found matching "{searchQuery}"
                </div>
              )}
            </div>
          ) : chats.length > 0 ? (
            chats.map(chat => {
              const chatName = chat.isGroup ? chat.name : chat.participants[0]?.name;
              const chatAvatar = chat.isGroup ? chat.avatar : chat.participants[0]?.avatar;
              return (
                <div 
                  key={chat.id}
                  onClick={() => setActiveChat(chat)}
                  className={cn(
                    "flex items-center px-4 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] cursor-pointer transition-colors border-b border-[#f0f2f5] dark:border-[#2f3b43]",
                    activeChat?.id === chat.id && "bg-[#ebebeb] dark:bg-[#2a3942]"
                  )}
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden mr-4 shadow-sm">
                    <img src={chatAvatar} alt={chatName} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <div className="font-medium text-[#111b21] dark:text-[#e9edef] truncate">{chatName}</div>
                      <div className="text-xs text-[#667781] dark:text-[#8696a0] whitespace-nowrap ml-2">
                        {chat.lastMessage && format(new Date(chat.lastMessage.timestamp), 'HH:mm')}
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-[#667781] dark:text-[#8696a0] truncate">
                        {chat.lastMessage?.text || "No messages yet"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 bg-[#f0f2f5] dark:bg-[#202c33] rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-[#8696a0]" />
              </div>
              <h3 className="text-[#111b21] dark:text-[#e9edef] font-medium mb-2">No chats yet</h3>
              <p className="text-sm text-[#667781] dark:text-[#8696a0] mb-6">
                Start a new conversation with your contacts or AI assistants.
              </p>
              <button 
                onClick={() => {
                  const searchInput = document.querySelector('input[placeholder="Search or start new chat"]') as HTMLInputElement;
                  searchInput?.focus();
                }}
                className="bg-[#00a884] text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-[#008f6f] transition-colors shadow-sm"
              >
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Window */}
      <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f5] dark:bg-[#202c33] h-[60px] border-l border-[#d1d7db] dark:border-[#2f3b43] z-10">
              <div 
                className="flex-1 flex items-center gap-3 cursor-pointer"
                onClick={() => setShowProfile(activeChat.isGroup ? activeChat as any : activeChat.participants[0])}
              >
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <img 
                    src={activeChat.isGroup ? activeChat.avatar : activeChat.participants[0].avatar} 
                    alt={activeChat.isGroup ? activeChat.name : activeChat.participants[0].name} 
                    className="w-full h-full object-cover" 
                    loading="lazy"
                  />
                </div>
                <div>
                  <div className="font-medium text-[#111b21] dark:text-[#e9edef]">
                    {activeChat.isGroup ? activeChat.name : activeChat.participants[0].name}
                  </div>
                  <div className="text-xs text-[#667781] dark:text-[#8696a0]">
                    {activeChat.isGroup ? (
                      'Group Chat'
                    ) : remoteTyping === activeChat.participants[0].id ? (
                      <span className="text-[#00a884] font-medium">typing...</span>
                    ) : (
                      activeChat.participants[0].lastSeen ? `last seen ${formatDistanceToNow(new Date(activeChat.participants[0].lastSeen))} ago` : 'online'
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[#54656f] dark:text-[#aebac1]">
                <Video className="w-5 h-5 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
                <Phone className="w-5 h-5 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
                <div className="w-[1px] h-6 bg-[#d1d7db] dark:bg-[#2f3b43]" />
                <Search className="w-5 h-5 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
                <MoreVertical className="w-5 h-5 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
              </div>
            </div>

            <div 
              className="flex-1 overflow-y-auto p-6 space-y-3 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] dark:bg-none bg-repeat"
              style={{ backgroundSize: '400px' }}
            >
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const isMe = msg.senderId === currentUser?.id;
                  const senderName = users.find(u => u.id === msg.senderId)?.name;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex w-full",
                        isMe ? "justify-end" : "justify-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm relative group min-w-[100px] transition-all",
                        isMe 
                          ? "bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none" 
                          : "bg-white dark:bg-[#202c33] rounded-tl-none"
                      )}>
                        {!isMe && activeChat.isGroup && (
                          <div className="text-[12px] font-medium text-[#00a884] mb-1">
                            {senderName}
                          </div>
                        )}
                        <div className="text-[14.2px] text-[#111b21] dark:text-[#e9edef] pb-4 pr-4 whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </div>
                        <div className="absolute bottom-1 right-2 flex items-center gap-1">
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0] font-medium">
                            {format(new Date(msg.timestamp), 'HH:mm')}
                          </span>
                          {isMe && (
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          )}
                        </div>
                        <button 
                          onClick={() => deleteMessage(msg.id)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-red-500 bg-black/5 dark:bg-white/5 rounded-full"
                          title="Delete message"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form 
              onSubmit={handleSendMessage}
              className="px-4 py-2 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center gap-4 min-h-[62px] border-l border-[#d1d7db] dark:border-[#2f3b43]"
            >
              <div className="flex gap-4 text-[#54656f] dark:text-[#aebac1]">
                <Smile className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
                <Paperclip className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  placeholder="Type a message" 
                  className="w-full bg-white dark:bg-[#2a3942] dark:text-[#e9edef] rounded-lg px-4 py-2.5 outline-none text-sm"
                  value={inputText}
                  onChange={handleTyping}
                />
              </div>
              <div className="text-[#54656f] dark:text-[#aebac1]">
                {inputText.trim() ? (
                  <button type="submit">
                    <Send className="w-6 h-6 cursor-pointer text-[#00a884]" />
                  </button>
                ) : (
                  <Mic className="w-6 h-6 cursor-pointer hover:text-[#111b21] dark:hover:text-white transition-colors" />
                )}
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#222e35] border-l border-[#d1d7db] dark:border-[#2f3b43] p-12">
            <div className="max-w-lg text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <img 
                  src="https://static.whatsapp.net/rsrc.php/v3/y6/r/wa669ae5z23.png" 
                  alt="WhatsApp" 
                  className="w-80 mx-auto mb-10 opacity-90 drop-shadow-md dark:invert dark:opacity-60"
                />
                <h1 className="text-3xl font-light text-[#41525d] dark:text-[#e9edef] mb-4">WhatsApp Web</h1>
                <p className="text-[#667781] dark:text-[#8696a0] leading-relaxed mb-8">
                  Send and receive messages without keeping your phone online.<br />
                  Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
                </p>
                <div className="flex flex-col items-center gap-4">
                  <button 
                    onClick={() => {
                      const searchInput = document.querySelector('input[placeholder="Search or start new chat"]') as HTMLInputElement;
                      searchInput?.focus();
                    }}
                    className="bg-[#00a884] text-white px-8 py-2.5 rounded-full font-medium hover:bg-[#008f6f] transition-all shadow-md active:scale-95"
                  >
                    Start a conversation
                  </button>
                  <p className="text-xs text-[#8696a0] dark:text-[#667781]">
                    Select a contact from the sidebar to begin chatting.
                  </p>
                </div>
              </motion.div>
            </div>
            <div className="absolute bottom-10 flex items-center gap-2 text-[#8696a0] dark:text-[#667781] text-xs tracking-wide uppercase">
              <LogOut className="w-3.5 h-3.5" />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* Profile Drawer */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 h-full w-[400px] bg-[#f0f2f5] dark:bg-[#111b21] shadow-2xl z-50 flex flex-col border-l border-[#d1d7db] dark:border-[#2f3b43]"
          >
            <div className="bg-white dark:bg-[#202c33] h-[110px] flex items-end p-5 pb-4 gap-6">
              <X 
                className="w-6 h-6 cursor-pointer text-[#54656f] dark:text-[#aebac1]" 
                onClick={() => {
                  setShowProfile(null);
                  setIsEditingProfile(false);
                }} 
              />
              <h2 className="text-lg font-medium text-[#111b21] dark:text-[#e9edef]">
                {showProfile.id === currentUser?.id ? 'Profile' : 'Contact info'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Avatar Section */}
              <div className="bg-white dark:bg-[#111b21] py-7 flex flex-col items-center mb-3 shadow-sm">
                <div className="w-52 h-52 rounded-full overflow-hidden mb-5">
                  <img src={showProfile.avatar} alt={showProfile.name} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl text-[#111b21] dark:text-[#e9edef]">{showProfile.name}</h3>
                  {showProfile.id === currentUser?.id && (
                    <Edit2 
                      className="w-5 h-5 text-[#54656f] dark:text-[#aebac1] cursor-pointer" 
                      onClick={() => {
                        setEditType('name');
                        setEditValue(showProfile.name);
                        setIsEditingProfile(true);
                      }}
                    />
                  )}
                </div>
                {showProfile.phoneNumber && (
                  <p className="text-[#667781] dark:text-[#8696a0] mt-1">{showProfile.phoneNumber}</p>
                )}
              </div>

              {/* Status Section */}
              <div className="bg-white dark:bg-[#111b21] p-6 mb-3 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-[#008069] dark:text-[#00a884] font-medium">About</span>
                  {showProfile.id === currentUser?.id && (
                    <Edit2 
                      className="w-5 h-5 text-[#54656f] dark:text-[#aebac1] cursor-pointer" 
                      onClick={() => {
                        setEditType('status');
                        setEditValue(showProfile.status);
                        setIsEditingProfile(true);
                      }}
                    />
                  )}
                </div>
                <p className="text-[#111b21] dark:text-[#e9edef]">{showProfile.status}</p>
              </div>

              {/* AI Personality Section */}
              {showProfile.isAI && (
                <div className="bg-white dark:bg-[#111b21] p-6 mb-3 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm text-[#008069] dark:text-[#00a884] font-medium">AI Personality</span>
                    <Edit2 
                      className="w-5 h-5 text-[#54656f] dark:text-[#aebac1] cursor-pointer" 
                      onClick={() => {
                        setEditType('personality');
                        setEditValue(showProfile.personality || '');
                        setIsEditingProfile(true);
                      }}
                    />
                  </div>
                  <p className="text-[#111b21] dark:text-[#e9edef] italic">"{showProfile.personality || 'Standard helpful assistant'}"</p>
                  <p className="text-xs text-[#667781] dark:text-[#8696a0] mt-3">
                    Customize how this AI interacts with you by changing its personality traits.
                  </p>
                </div>
              )}

              {/* Additional Info */}
              {!showProfile.isAI && showProfile.id !== currentUser?.id && (
                <div className="bg-white dark:bg-[#111b21] p-6 shadow-sm">
                  <div className="flex items-center gap-4 text-[#54656f] dark:text-[#aebac1]">
                    <Info className="w-5 h-5" />
                    <span className="text-sm">Media, links and docs</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditingProfile && editType && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-[#2a3942] w-full max-w-md rounded-lg shadow-xl overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-xl font-medium text-[#111b21] dark:text-[#e9edef] mb-4">
                  Edit {editType.charAt(0).toUpperCase() + editType.slice(1)}
                </h3>
                {editType === 'personality' ? (
                  <textarea
                    className="w-full border dark:border-[#2f3b43] bg-white dark:bg-[#2a3942] dark:text-[#e9edef] rounded-md p-3 outline-none focus:border-[#00a884] min-h-[120px]"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Describe how the AI should behave..."
                  />
                ) : (
                  <input
                    type="text"
                    className="w-full border-b-2 border-[#00a884] bg-transparent py-2 outline-none text-lg text-[#111b21] dark:text-[#e9edef]"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                  />
                )}
                <div className="flex justify-end gap-4 mt-8">
                  <button 
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 text-[#54656f] dark:text-[#aebac1] font-medium hover:bg-[#f0f2f5] dark:hover:bg-[#202c33] rounded-md transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => {
                      if (showProfile) {
                        updateUserProfile(showProfile.id, { [editType]: editValue });
                      }
                    }}
                    className="px-6 py-2 bg-[#00a884] text-white font-medium rounded-md hover:bg-[#008f6f] transition-colors shadow-sm"
                  >
                    SAVE
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Group Modal */}
      <AnimatePresence>
        {showNewGroup && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-[#2a3942] w-full max-w-md rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-[#f0f2f5] dark:border-[#2f3b43]">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-medium text-[#111b21] dark:text-[#e9edef]">New Group</h3>
                  <X className="w-6 h-6 cursor-pointer text-[#54656f] dark:text-[#aebac1]" onClick={() => setShowNewGroup(false)} />
                </div>
                <input
                  type="text"
                  placeholder="Group Name"
                  className="w-full border-b-2 border-[#00a884] bg-transparent py-2 outline-none text-lg text-[#111b21] dark:text-[#e9edef]"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  autoFocus
                />
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-sm text-[#667781] dark:text-[#8696a0] mb-4 uppercase font-medium tracking-wider">Select Contacts</p>
                <div className="space-y-1">
                  {users.map(user => (
                    <div 
                      key={user.id}
                      onClick={() => {
                        setSelectedContacts(prev => 
                          prev.includes(user.id) 
                            ? prev.filter(id => id !== user.id) 
                            : [...prev, user.id]
                        );
                      }}
                      className={cn(
                        "flex items-center p-3 rounded-lg cursor-pointer transition-colors",
                        selectedContacts.includes(user.id) ? "bg-[#f0f2f5] dark:bg-[#202c33]" : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-[#111b21] dark:text-[#e9edef]">{user.name}</div>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        selectedContacts.includes(user.id) ? "border-[#00a884] bg-[#00a884]" : "border-[#d1d7db] dark:border-[#2f3b43]"
                      )}>
                        {selectedContacts.includes(user.id) && <CheckCheck className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-[#f0f2f5] dark:bg-[#202c33] flex justify-end gap-4">
                <button 
                  onClick={() => setShowNewGroup(false)}
                  className="px-4 py-2 text-[#54656f] dark:text-[#aebac1] font-medium hover:bg-white dark:hover:bg-[#2a3942] rounded-md transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={createGroup}
                  disabled={!groupName.trim() || selectedContacts.length === 0}
                  className="px-6 py-2 bg-[#00a884] text-white font-medium rounded-md hover:bg-[#008f6f] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  CREATE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
