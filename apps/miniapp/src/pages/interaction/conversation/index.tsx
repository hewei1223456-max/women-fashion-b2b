import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Input, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { timeAgo } from '@wfb/shared-utils';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import ListEmpty from '@/components/ListEmpty';
import { toastError } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

export default function ConversationPage() {
  const router = useRouter();
  const id = Number(router.params?.id ?? 0);
  const me = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const detail = useQuery({ queryKey: ['conversation', id], queryFn: () => api.message.conversation(id), enabled: !!id });

  const messages = useMemo(() => detail.data?.messages ?? [], [detail.data]);
  const peer = detail.data?.conversation?.peer;

  useEffect(() => {
    if (!peer?.nickname) return;
    Taro.setNavigationBarTitle({ title: peer.nickname });
  }, [peer?.nickname]);

  useEffect(() => {
    if (!id) return;
    api.message.read(id).then(() => queryClient.invalidateQueries({ queryKey: ['unread-count'] })).catch(() => undefined);
  }, [id]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !peer || sending) return;
    setSending(true);
    try {
      await api.message.send({ receiverId: peer.id, content, contentType: 'text' });
      setDraft('');
      await detail.refetch();
    } catch (e) {
      toastError(errMsg(e, '发送失败'));
    } finally {
      setSending(false);
    }
  };

  if (!id) {
    return (
      <View className="page">
        <ListEmpty error="缺少会话 ID" />
      </View>
    );
  }

  const lastId = messages.length ? `msg-${messages[messages.length - 1].id}` : '';

  return (
    <View className="conv">
      <ListEmpty loading={detail.isLoading} error={detail.isError ? errMsg(detail.error, '会话加载失败') : null} empty={false} onRetry={() => detail.refetch()} />

      {!detail.isLoading && !detail.isError ? (
        <ScrollView className="conv__scroll" scrollY scrollIntoView={lastId} scrollWithAnimation>
          {messages.length === 0 ? (
            <View className="conv__tip col-center">
              <Text className="f-xs t3">还没有消息，发送第一条打个招呼吧</Text>
            </View>
          ) : null}
          {messages.map((msg) => {
            const mine = msg.senderId === me?.id;
            return (
              <View key={msg.id} id={`msg-${msg.id}`} className={`conv__row ${mine ? 'is-mine' : ''}`}>
                {!mine ? <Image className="conv__avatar" src={peer?.avatarUrl ?? ''} mode="aspectFill" /> : null}
                <View className={`conv__bubble ${mine ? 'is-mine' : ''}`}>
                  {msg.contentType === 'product_card' && msg.product ? (
                    <View
                      className="conv__card"
                      onClick={() => Taro.navigateTo({ url: `/pages/source/detail?id=${msg.product?.id}` })}
                    >
                      <Image className="conv__card-img" src={msg.product.images?.[0]} mode="aspectFill" />
                      <View className="col flex-1">
                        <Text className="f-sm t1 ellipsis-2">{msg.product.title}</Text>
                        <Text className="f-xs accent">{msg.product.priceRange}</Text>
                      </View>
                    </View>
                  ) : null}
                  {msg.content ? <Text className="conv__text">{msg.content}</Text> : null}
                  <Text className="conv__time">{timeAgo(msg.createdAt)}</Text>
                </View>
                {mine ? <Image className="conv__avatar" src={me?.avatarUrl ?? ''} mode="aspectFill" /> : null}
              </View>
            );
          })}
          <View className="conv__pad" />
        </ScrollView>
      ) : null}

      <View className="conv__input-bar row">
        <Input
          className="conv__input flex-1"
          value={draft}
          placeholder="输入消息…"
          confirmType="send"
          onInput={(e) => setDraft(e.detail.value)}
          onConfirm={send}
        />
        <View className={`btn btn-sm btn-primary conv__send ${sending ? 'btn-disabled' : ''}`} onClick={send}>
          <Text>发送</Text>
        </View>
      </View>
    </View>
  );
}
