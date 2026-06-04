/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { NotificationAlert } from '../types';
import { Bell, BellOff, MessageSquare, MapPin, Calendar, Sparkles, CheckCheck } from 'lucide-react';

interface NotificationPanelProps {
  notifications: NotificationAlert[];
  onMarkAllAsRead: () => void;
}

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  chat: { icon: <MessageSquare className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  arrival: { icon: <MapPin className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  promise: { icon: <Calendar className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' },
  invite: { icon: <Sparkles className="w-4 h-4" />, color: 'text-purple-600', bg: 'bg-purple-100' },
  system: { icon: <Bell className="w-4 h-4" />, color: 'text-rose-600', bg: 'bg-rose-100' },
};

export default function NotificationPanel({ notifications, onMarkAllAsRead }: NotificationPanelProps) {
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900 flex items-center gap-2">
            알림
            {unread > 0 && (
              <span className="text-[11px] bg-rose-500 text-white px-2 py-0.5 rounded-full font-semibold">{unread}</span>
            )}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">친구 위치 · 약속 · 초대 알림</p>
        </div>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl font-semibold transition"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            모두 읽음
          </button>
        )}
      </div>

      {/* 알림 목록 */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-16 text-gray-400">
            <BellOff className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">새 알림이 없습니다</p>
            <p className="text-xs mt-1 opacity-70">친구가 도착하거나 새 약속이 생기면 알려드려요</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map((notif) => {
              const meta = TYPE_META[notif.type] || TYPE_META.system;
              return (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${notif.read ? 'opacity-50' : 'hover:bg-gray-50'}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.bg} ${meta.color}`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{notif.title}</p>
                      <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed break-words">{notif.message}</p>
                  </div>
                  {!notif.read && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
