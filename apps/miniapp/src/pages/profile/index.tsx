import { View, Text } from '@tarojs/components';
import TabBar from '@/components/TabBar';

export default function Profile() {
  return (
    <View className="page-safe">
      <View className="card">
        <Text className="f-xl bold">我的</Text>
      </View>
      <TabBar current="profile" />
    </View>
  );
}
