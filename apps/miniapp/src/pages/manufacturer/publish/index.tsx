import { useState } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product, StyleTag } from '@wfb/shared-types';
import { MARKETS, STYLE_TAGS, planOf } from '@wfb/shared-types';
import { api } from '@/services/request';
import { useAppStore } from '@/store/app';
import Card from '@/components/Card';
import ChipSelect from '@/components/ChipSelect';
import ListEmpty from '@/components/ListEmpty';
import Tag from '@/components/Tag';
import Modal from '@/components/Modal';
import { hideLoading, showLoading, toastError, toastSuccess } from '@/components/Toast';
import { errMsg } from '@/components/utils';
import './index.scss';

export default function ProductPublish() {
  const user = useAppStore((s) => s.user);
  const queryClient = useQueryClient();
  const plan = planOf(user?.memberLevel ?? 'manufacturer_free');

  const [editingId, setEditingId] = useState(0);
  const [title, setTitle] = useState('');
  const [images, setImages] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [moq, setMoq] = useState('3');
  const [styleTag, setStyleTag] = useState<StyleTag>('韩系');
  const [shipFrom, setShipFrom] = useState('杭州');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(0);

  const mine = useQuery({ queryKey: ['my-products'], queryFn: () => api.product.my({ page: 1, pageSize: 50 }) });
  const list: Product[] = mine.data?.list ?? [];
  const limit = plan.productLimit;
  const reachedLimit = limit !== -1 && list.length >= limit;

  const resetForm = () => {
    setEditingId(0);
    setTitle('');
    setImages('');
    setVideoUrl('');
    setPriceRange('');
    setMoq('3');
    setStyleTag('韩系');
    setShipFrom('杭州');
    setDescription('');
  };

  const loadForEdit = (p: Product) => {
    setEditingId(p.id);
    setTitle(p.title);
    setImages((p.images ?? []).join('\n'));
    setVideoUrl(p.videoUrl ?? '');
    setPriceRange(p.priceRange);
    setMoq(String(p.moq));
    setStyleTag(p.styleTag);
    setShipFrom(p.shipFrom);
    setDescription(p.description ?? '');
    Taro.pageScrollTo({ scrollTop: 0, duration: 200 });
  };

  const submit = async () => {
    const imageList = images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (title.trim().length < 4) return toastError('请填写款名（至少 4 个字）');
    if (!imageList.length) return toastError('请至少填入 1 张款图链接');
    if (!priceRange.trim()) return toastError('请填写价格带，例如 120-180');
    if (!editingId && reachedLimit) return toastError(`当前版本最多发布 ${limit} 个款，请升级版本`);
    if (submitting) return;

    setSubmitting(true);
    showLoading(editingId ? '保存中...' : '发布中...');
    try {
      const dto = {
        title: title.trim(),
        images: imageList,
        videoUrl: videoUrl.trim() || undefined,
        priceRange: priceRange.trim(),
        moq: Number(moq) || 1,
        styleTag,
        shipFrom,
        description: description.trim(),
      };
      if (editingId) {
        await api.product.update(editingId, dto);
        toastSuccess('已保存修改');
      } else {
        await api.product.publish(dto);
        toastSuccess('款已提交，审核通过后展示');
      }
      hideLoading();
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    } catch (e) {
      hideLoading();
      toastError(errMsg(e, '发布失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    const id = deleteId;
    setDeleteId(0);
    if (!id) return;
    try {
      await api.product.remove(id);
      toastSuccess('已删除');
      queryClient.invalidateQueries({ queryKey: ['my-products'] });
    } catch (e) {
      toastError(errMsg(e, '删除失败'));
    }
  };

  return (
    <View className="page">
      <Card title={editingId ? `编辑款 #${editingId}` : '发布新款'} subtitle={`${plan.label} · 可发布款 ${limit === -1 ? '不限' : `${list.length}/${limit}`}`}>
        {reachedLimit && !editingId ? (
          <View className="pub__limit">
            <Text className="f-xs">已达当前版本可发布款上限，升级版本可发布更多款。</Text>
          </View>
        ) : null}

        <Text className="field-label">款名 *</Text>
        <Input className="input" value={title} maxlength={60} placeholder="例如：法式泡泡袖碎花连衣裙" onInput={(e) => setTitle(e.detail.value)} />

        <Text className="field-label">款图链接 *（每行一个，第一张作封面）</Text>
        <Textarea
          className="textarea pub__images"
          value={images}
          maxlength={2000}
          placeholder={'https://…/1.jpg\nhttps://…/2.jpg'}
          onInput={(e) => setImages(e.detail.value)}
        />

        <Text className="field-label">视频链接（可选）</Text>
        <Input className="input" value={videoUrl} placeholder="https://…/video.mp4" onInput={(e) => setVideoUrl(e.detail.value)} />

        <Text className="field-label">价格带 *</Text>
        <Input className="input" value={priceRange} placeholder="例如 120-180" onInput={(e) => setPriceRange(e.detail.value)} />

        <Text className="field-label">起订量（件）</Text>
        <Input className="input" type="number" value={moq} placeholder="3" onInput={(e) => setMoq(e.detail.value)} />

        <Text className="field-label">风格</Text>
        <ChipSelect options={STYLE_TAGS.map((t) => ({ value: t, label: t }))} value={styleTag} onSelect={(v) => setStyleTag(v as StyleTag)} />

        <Text className="field-label">发货地</Text>
        <ChipSelect options={MARKETS.map((m) => ({ value: m, label: m }))} value={shipFrom} onSelect={setShipFrom} />

        <Text className="field-label">款说明</Text>
        <Textarea
          className="textarea"
          value={description}
          maxlength={1000}
          placeholder="面料、版型、尺码、颜色、拿货政策等"
          onInput={(e) => setDescription(e.detail.value)}
        />

        <View className="row pub__actions">
          <View className={`btn btn-primary flex-1 ${submitting ? 'btn-disabled' : ''}`} onClick={submit}>
            <Text>{submitting ? '提交中...' : editingId ? '保存修改' : '发布款'}</Text>
          </View>
          {editingId ? (
            <View className="btn btn-plain pub__cancel" onClick={resetForm}>
              <Text>取消编辑</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Card title="我的款" subtitle={mine.data ? `共 ${mine.data.total} 个` : undefined} noPadding>
        <View className="pub__list">
          <ListEmpty
            loading={mine.isLoading}
            error={mine.isError ? errMsg(mine.error, '我的款加载失败') : null}
            empty={!list.length}
            emptyText="还没有发布过款"
            emptyDesc="发布后可被店主搜索、收藏与加微"
            onRetry={() => mine.refetch()}
          />

          {list.map((p) => (
            <View key={p.id} className="pub__row">
              <View className="row-between">
                <Text className="pub__row-title f-sm bold t1 ellipsis">{p.title}</Text>
                <Text className={`pub__row-status f-xs ${p.status === 'approved' ? 'brand' : p.status === 'rejected' ? 'accent' : 't3'}`}>
                  {p.status === 'approved' ? '已通过' : p.status === 'rejected' ? '未通过' : '审核中'}
                </Text>
              </View>
              <View className="row wrap pub__row-tags">
                <Tag styleTag={p.styleTag} />
                <View className="tag tag-gray">
                  <Text>¥{p.priceRange}</Text>
                </View>
                <View className="tag tag-gray">
                  <Text>{p.moq} 件起</Text>
                </View>
                <View className="tag tag-outline">
                  <Text>浏览 {p.viewCount}</Text>
                </View>
                <View className="tag tag-outline">
                  <Text>加微 {p.contactCount}</Text>
                </View>
              </View>
              <View className="row pub__row-actions">
                <View className="btn btn-plain btn-sm" onClick={() => loadForEdit(p)}>
                  <Text>编辑</Text>
                </View>
                <View className="btn btn-plain btn-sm pub__row-del" onClick={() => setDeleteId(p.id)}>
                  <Text>删除</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Modal
        visible={!!deleteId}
        title="删除款"
        content="删除后该款将不再展示，确定删除吗？"
        confirmText="删除"
        onConfirm={remove}
        onCancel={() => setDeleteId(0)}
      />
    </View>
  );
}
