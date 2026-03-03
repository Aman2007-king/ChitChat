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
  ChevronLeft
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
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('wa_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setLoginStep('complete');
    }
  }, []);

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

  const startChat = (otherUser: User) => {
    const existingChat = chats.find(c => 
      c.participants.some(p => p.id === otherUser.id)
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
      <div className="flex flex-col w-[400px] border-r border-[#d1d7db] bg-white">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f5] h-[60px]">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
            <img src={currentUser?.avatar} alt="Me" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-5 text-[#54656f]">
            <CircleDashed className="w-6 h-6 cursor-pointer" />
            <MessageSquare className="w-6 h-6 cursor-pointer" />
            <MoreVertical className="w-6 h-6 cursor-pointer" />
          </div>
        </div>

        {/* Search */}
        <div className="p-2">
          <div className="flex items-center bg-[#f0f2f5] rounded-lg px-3 py-1.5">
            <Search className="w-5 h-5 text-[#54656f] mr-4" />
            <input 
              type="text" 
              placeholder="Search or start new chat" 
              className="bg-transparent border-none outline-none w-full text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {searchQuery ? (
            <div className="py-2">
              <div className="px-4 py-3 text-[#008069] text-sm font-medium uppercase tracking-wider">
                Contacts
              </div>
              {users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase())).map(user => (
                <div 
                  key={user.id}
                  onClick={() => startChat(user)}
                  className="flex items-center px-4 py-3 hover:bg-[#f5f6f6] cursor-pointer transition-colors"
                >
                  <div className="w-12 h-12 rounded-full overflow-hidden mr-4">
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 border-b border-[#f0f2f5] pb-3">
                    <div className="font-medium text-[#111b21]">{user.name}</div>
                    <div className="text-sm text-[#667781] truncate">{user.status}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={cn(
                  "flex items-center px-4 py-3 hover:bg-[#f5f6f6] cursor-pointer transition-colors",
                  activeChat?.id === chat.id && "bg-[#ebebeb]"
                )}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden mr-4">
                  <img src={chat.participants[0].avatar} alt={chat.participants[0].name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 border-b border-[#f0f2f5] pb-3">
                  <div className="flex justify-between items-center mb-1">
                    <div className="font-medium text-[#111b21]">{chat.participants[0].name}</div>
                    <div className="text-xs text-[#667781]">
                      {chat.lastMessage && format(new Date(chat.lastMessage.timestamp), 'HH:mm')}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-[#667781] truncate max-w-[200px]">
                      {chat.lastMessage?.text || "No messages yet"}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Window */}
      <div className="flex-1 flex flex-col bg-[#efeae2] relative">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#f0f2f5] h-[60px] border-l border-[#d1d7db] z-10">
              <div className="flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <img src={activeChat.participants[0].avatar} alt={activeChat.participants[0].name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <div className="font-medium text-[#111b21]">{activeChat.participants[0].name}</div>
                  <div className="text-xs text-[#667781]">
                    {remoteTyping === activeChat.participants[0].id ? (
                      <span className="text-[#00a884] font-medium">typing...</span>
                    ) : (
                      activeChat.participants[0].lastSeen ? `last seen ${formatDistanceToNow(new Date(activeChat.participants[0].lastSeen))} ago` : 'online'
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[#54656f]">
                <Video className="w-5 h-5 cursor-pointer" />
                <Phone className="w-5 h-5 cursor-pointer" />
                <div className="w-[1px] h-6 bg-[#d1d7db]" />
                <Search className="w-5 h-5 cursor-pointer" />
                <MoreVertical className="w-5 h-5 cursor-pointer" />
              </div>
            </div>

            {/* Messages Area */}
            <div 
              className="flex-1 overflow-y-auto p-6 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
              style={{ backgroundSize: '400px' }}
            >
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const isMe = msg.senderId === currentUser?.id;
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
                        "max-w-[65%] px-2 py-1 rounded-lg shadow-sm relative group min-w-[80px]",
                        isMe ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none"
                      )}>
                        <div className="text-[14.2px] text-[#111b21] pb-3 pr-8 whitespace-pre-wrap break-words">
                          {msg.text}
                        </div>
                        <div className="absolute bottom-1 right-1.5 flex items-center gap-1">
                          <span className="text-[11px] text-[#667781]">
                            {format(new Date(msg.timestamp), 'HH:mm')}
                          </span>
                          {isMe && (
                            <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                          )}
                        </div>
                        <button 
                          onClick={() => deleteMessage(msg.id)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
              className="px-4 py-2 bg-[#f0f2f5] flex items-center gap-4 min-h-[62px]"
            >
              <div className="flex gap-4 text-[#54656f]">
                <Smile className="w-6 h-6 cursor-pointer" />
                <Paperclip className="w-6 h-6 cursor-pointer" />
              </div>
              <div className="flex-1">
                <input 
                  type="text" 
                  placeholder="Type a message" 
                  className="w-full bg-white rounded-lg px-4 py-2.5 outline-none text-sm"
                  value={inputText}
                  onChange={handleTyping}
                />
              </div>
              <div className="text-[#54656f]">
                {inputText.trim() ? (
                  <button type="submit">
                    <Send className="w-6 h-6 cursor-pointer text-[#00a884]" />
                  </button>
                ) : (
                  <Mic className="w-6 h-6 cursor-pointer" />
                )}
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] border-l border-[#d1d7db]">
            <div className="max-w-md text-center">
              <img 
                src="https://static.whatsapp.net/rsrc.php/v3/y6/r/wa669ae5z23.png" 
                alt="WhatsApp" 
                className="w-80 mx-auto mb-8 opacity-80"
              />
              <h1 className="text-3xl font-light text-[#41525d] mb-4">WhatsApp Web</h1>
              <p className="text-sm text-[#667781] leading-relaxed">
                Send and receive messages without keeping your phone online.<br />
                Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
              </p>
            </div>
            <div className="absolute bottom-10 flex items-center gap-1 text-[#8696a0] text-sm">
              <LogOut className="w-4 h-4" />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
