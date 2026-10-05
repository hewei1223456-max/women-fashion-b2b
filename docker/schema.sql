-- ============================================================================
-- 女装B2B行业平台 · MySQL 8.0 建表脚本（生产库结构）
--
-- 与 Demo 模式（DATA_DRIVER=memory）使用的内存 Store 一一对应：
--   apps/api/src/core/db.ts 的 Store 接口就是本文件的 TypeScript 投影。
--
-- 用法：
--   mysql -h127.0.0.1 -uroot -p < docker/schema.sql
--   或 docker compose -f docker/docker-compose.yml up -d mysql（自动执行）
--
-- 约定：
--   * 所有表 ENGINE=InnoDB, utf8mb4_0900_ai_ci（支持 emoji）
--   * 时间统一 DATETIME，默认 CURRENT_TIMESTAMP
--   * 计数字段（like_count 等）为冗余统计列，由业务侧与明细表同事务更新
--   * JSON 字段用于标签/图片数组等半结构化数据（MySQL 8 原生支持）
-- ============================================================================

CREATE DATABASE IF NOT EXISTS women_fashion_b2b
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE women_fashion_b2b;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. 用户与组织
-- ============================================================================

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '手机号（登录通道）',
  `wx_openid` VARCHAR(64) DEFAULT NULL COMMENT '微信小程序 openid',
  `dy_openid` VARCHAR(64) DEFAULT NULL COMMENT '抖音小程序 openid',
  `ali_openid` VARCHAR(64) DEFAULT NULL COMMENT '支付宝小程序 openid',
  `nickname` VARCHAR(50) NOT NULL,
  `avatar_url` VARCHAR(500) DEFAULT '',
  `bio` VARCHAR(200) DEFAULT NULL,
  `role` ENUM('shop_owner','manufacturer','landmark','lecturer','admin') NOT NULL DEFAULT 'shop_owner',
  `cert_status` ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  `cert_license_url` VARCHAR(500) DEFAULT NULL COMMENT '营业执照图片',
  `cert_ocr_data` JSON DEFAULT NULL COMMENT '营业执照 OCR 结果',
  `company_name` VARCHAR(120) DEFAULT NULL COMMENT '认证主体名称',
  `style_tags` JSON DEFAULT NULL COMMENT '风格标签数组，如 ["韩系","通勤"]',
  `price_band` VARCHAR(20) DEFAULT NULL COMMENT '主营价格带',
  `sourcing_cities` JSON DEFAULT NULL COMMENT '常去拿货地数组',
  `member_level` ENUM('free','elite','shark','tour','manufacturer_free','manufacturer_basic','manufacturer_pro','manufacturer_enterprise')
      NOT NULL DEFAULT 'free',
  `member_expire_at` DATETIME DEFAULT NULL,
  `push_enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否接收厂家主动私信',
  `privacy_agreed_at` DATETIME DEFAULT NULL COMMENT '隐私政策同意时间（合规留痕）',
  -- 接收权重计算所需的活跃度快照（也可由 behaviors 实时聚合）
  `login_count_7d` INT NOT NULL DEFAULT 0,
  `action_count_7d` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_phone` (`phone`),
  UNIQUE KEY `uk_wx_openid` (`wx_openid`),
  UNIQUE KEY `uk_dy_openid` (`dy_openid`),
  UNIQUE KEY `uk_ali_openid` (`ali_openid`),
  KEY `idx_role` (`role`),
  KEY `idx_cert_status` (`cert_status`),
  KEY `idx_member_level` (`member_level`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表（店主/厂家/大店/讲师/运营）';

DROP TABLE IF EXISTS `organizations`;
CREATE TABLE `organizations` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `owner_id` BIGINT NOT NULL COMMENT '归属用户（厂家法人/店主）',
  `name` VARCHAR(120) NOT NULL COMMENT '公司/个体户名称',
  `role` VARCHAR(32) NOT NULL DEFAULT 'manufacturer',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_owner` (`owner_id`),
  CONSTRAINT `fk_org_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='认证主体（公司/个体户）';

-- ============================================================================
-- 2. 厂家款与货源
-- ============================================================================

DROP TABLE IF EXISTS `manufacturer_products`;
CREATE TABLE `manufacturer_products` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `manufacturer_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `images` JSON DEFAULT NULL COMMENT '款图数组（1-9 张）',
  `video_url` VARCHAR(500) DEFAULT NULL,
  `price_range` VARCHAR(50) DEFAULT NULL COMMENT '价格带文案，如 89-129',
  `price_min` INT NOT NULL DEFAULT 0 COMMENT '价格带下界（筛选/推荐用）',
  `moq` INT NOT NULL DEFAULT 1 COMMENT '最小起订量',
  `style_tag` VARCHAR(50) DEFAULT NULL COMMENT '主风格标签',
  `ship_from` VARCHAR(100) DEFAULT NULL COMMENT '发货地',
  `description` TEXT,
  `status` ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `style_vector` JSON DEFAULT NULL COMMENT 'Phase 2 双塔 Item 向量（预留）',
  `view_count` INT NOT NULL DEFAULT 0,
  `contact_count` INT NOT NULL DEFAULT 0 COMMENT '加微次数（转化率分子）',
  `collect_count` INT NOT NULL DEFAULT 0,
  `like_count` INT NOT NULL DEFAULT 0,
  `comment_count` INT NOT NULL DEFAULT 0,
  `deleted` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_manufacturer` (`manufacturer_id`),
  KEY `idx_status` (`status`, `created_at`),
  KEY `idx_style` (`style_tag`),
  KEY `idx_price` (`price_min`),
  KEY `idx_ship_from` (`ship_from`),
  -- 搜索排序「历史表现 35%」直接命中该组合索引
  KEY `idx_perf` (`contact_count`, `view_count`),
  CONSTRAINT `fk_product_mf` FOREIGN KEY (`manufacturer_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='厂家款';

-- ============================================================================
-- 3. 内容（资讯 + 货源 UGC 统一存储，用 board 区分板块）
-- ============================================================================

DROP TABLE IF EXISTS `knowledge_articles`;
CREATE TABLE `knowledge_articles` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `author_id` BIGINT NOT NULL,
  `board` ENUM('info','source') NOT NULL DEFAULT 'info' COMMENT '所属板块：资讯/货源',
  `type` ENUM('distillation','methodology','news','course','guide','ugc') NOT NULL,
  `content_type` ENUM('image_text','video','long_article','product_card','sourcing_shot','outfit','groupbuy_recruit','fair_info')
      NOT NULL DEFAULT 'image_text',
  `title` VARCHAR(200) NOT NULL,
  `summary` VARCHAR(300) DEFAULT NULL,
  `content` LONGTEXT,
  `cover_url` VARCHAR(500) DEFAULT NULL,
  `images` JSON DEFAULT NULL COMMENT '图片数组（1-18 张）',
  `video_url` VARCHAR(500) DEFAULT NULL COMMENT '视频（最长 5 分钟）',
  `period` INT DEFAULT NULL COMMENT '游学蒸馏期数',
  `attachments` JSON DEFAULT NULL COMMENT '附件（PPT/PDF）',
  `related_products` JSON DEFAULT NULL COMMENT '资讯→货源 联动：关联款 ID 数组',
  `product_id` BIGINT DEFAULT NULL COMMENT '货源 UGC 关联的款',
  `price_range` VARCHAR(50) DEFAULT NULL,
  `moq` INT DEFAULT NULL,
  `style_tags` JSON DEFAULT NULL,
  `topics` JSON DEFAULT NULL COMMENT '话题标签数组（不含 #）',
  `location` VARCHAR(100) DEFAULT NULL COMMENT '定位市场名',
  `visibility` ENUM('public','fans','group','elite','shark','landmark') NOT NULL DEFAULT 'public',
  `audit_status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `topped` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '个人主页置顶（最多 3 条）',
  `deleted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除',
  `restorable_until` DATETIME DEFAULT NULL COMMENT '软删除后 30 天内可恢复',
  `view_count` INT NOT NULL DEFAULT 0,
  `like_count` INT NOT NULL DEFAULT 0,
  `collect_count` INT NOT NULL DEFAULT 0,
  `comment_count` INT NOT NULL DEFAULT 0,
  `share_count` INT NOT NULL DEFAULT 0,
  `contact_count` INT NOT NULL DEFAULT 0 COMMENT '货源内容专属：通过该内容加微的次数',
  `ces_score` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'CES 热度分（评论35/收藏28/完读18/分享12/点赞7）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_author_created` (`author_id`, `created_at`),
  KEY `idx_board_status` (`board`, `audit_status`, `deleted`),
  KEY `idx_type` (`type`),
  -- 推荐流按 CES + 时间排序的核心索引
  KEY `idx_ces` (`ces_score`, `created_at`),
  KEY `idx_period` (`period`),
  CONSTRAINT `fk_article_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_article_product` FOREIGN KEY (`product_id`) REFERENCES `manufacturer_products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容（资讯 + 货源 UGC）';

-- ============================================================================
-- 4. 地标大店与课程
-- ============================================================================

DROP TABLE IF EXISTS `landmark_shops`;
CREATE TABLE `landmark_shops` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `shop_name` VARCHAR(100) NOT NULL,
  `city` VARCHAR(50) DEFAULT NULL,
  `annual_revenue` VARCHAR(50) DEFAULT NULL COMMENT '年营业额（脱敏区间或数值文案）',
  `style_description` TEXT,
  `cover_url` VARCHAR(500) DEFAULT NULL,
  `article_count` INT NOT NULL DEFAULT 0,
  `follower_count` INT NOT NULL DEFAULT 0,
  `periods` INT NOT NULL DEFAULT 0 COMMENT '已举办游学/活动期数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user` (`user_id`),
  KEY `idx_city` (`city`),
  CONSTRAINT `fk_landmark_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地标大店主页';

DROP TABLE IF EXISTS `courses`;
CREATE TABLE `courses` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `lecturer_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `category` VARCHAR(50) DEFAULT NULL COMMENT '组货/陈列/搭配/短视频/直播',
  `cover_url` VARCHAR(500) DEFAULT NULL,
  `duration` VARCHAR(50) DEFAULT NULL,
  `price` INT NOT NULL DEFAULT 0 COMMENT '单位：元，0 = 免费',
  `free` TINYINT(1) NOT NULL DEFAULT 0,
  `lesson_count` INT NOT NULL DEFAULT 1,
  `student_count` INT NOT NULL DEFAULT 0,
  `intro` TEXT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_lecturer` (`lecturer_id`),
  KEY `idx_category` (`category`),
  CONSTRAINT `fk_course_lecturer` FOREIGN KEY (`lecturer_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='讲师课程';

-- ============================================================================
-- 5. 互动组件（点赞/评论/收藏/关注/转发）
-- ============================================================================

DROP TABLE IF EXISTS `likes`;
CREATE TABLE `likes` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` ENUM('article','product','comment') NOT NULL,
  `target_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_target` (`user_id`, `target_type`, `target_id`),
  KEY `idx_target` (`target_type`, `target_id`),
  CONSTRAINT `fk_like_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='点赞（唯一键保证幂等）';

DROP TABLE IF EXISTS `comments`;
CREATE TABLE `comments` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` ENUM('article','product','comment') NOT NULL,
  `target_id` BIGINT NOT NULL,
  `parent_id` BIGINT DEFAULT NULL COMMENT '二级回复的父评论 ID',
  `content` TEXT,
  `images` JSON DEFAULT NULL,
  `mentions` JSON DEFAULT NULL COMMENT '@ 提及的用户 ID 数组',
  `like_count` INT NOT NULL DEFAULT 0,
  `reply_count` INT NOT NULL DEFAULT 0,
  `topped` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '作者置顶评论',
  `status` ENUM('pending','approved','rejected','deleted') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_target` (`target_type`, `target_id`, `status`, `created_at`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论与回复';

DROP TABLE IF EXISTS `collections`;
CREATE TABLE `collections` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` ENUM('article','product') NOT NULL,
  `target_id` BIGINT NOT NULL,
  `folder_name` VARCHAR(50) NOT NULL DEFAULT '默认收藏夹',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_target` (`user_id`, `target_type`, `target_id`),
  KEY `idx_target` (`target_type`, `target_id`),
  CONSTRAINT `fk_collect_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='收藏（支持收藏夹分类）';

DROP TABLE IF EXISTS `follows`;
CREATE TABLE `follows` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `follower_id` BIGINT NOT NULL,
  `following_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_follower_following` (`follower_id`, `following_id`),
  KEY `idx_following` (`following_id`),
  CONSTRAINT `fk_follow_follower` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_follow_following` FOREIGN KEY (`following_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关注关系';

DROP TABLE IF EXISTS `shares`;
CREATE TABLE `shares` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` ENUM('article','product') NOT NULL,
  `target_id` BIGINT NOT NULL,
  `channel` ENUM('wechat','moments','group','link') NOT NULL DEFAULT 'link',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_share_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转发记录（CES 分享维度输入）';

-- ============================================================================
-- 6. 私信与通知
-- ============================================================================

DROP TABLE IF EXISTS `conversations`;
CREATE TABLE `conversations` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_a_id` BIGINT NOT NULL COMMENT '较小的一方（保证唯一键稳定）',
  `user_b_id` BIGINT NOT NULL COMMENT '较大的一方',
  `last_message_id` BIGINT DEFAULT NULL,
  `last_message_at` DATETIME DEFAULT NULL,
  `unread_count_a` INT NOT NULL DEFAULT 0,
  `unread_count_b` INT NOT NULL DEFAULT 0,
  `deleted_a` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'A 侧删除会话（软删除）',
  `deleted_b` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_users` (`user_a_id`, `user_b_id`),
  KEY `idx_last_at` (`last_message_at`),
  CONSTRAINT `fk_conv_a` FOREIGN KEY (`user_a_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_b` FOREIGN KEY (`user_b_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信会话';

DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `conversation_id` BIGINT NOT NULL,
  `sender_id` BIGINT NOT NULL,
  `receiver_id` BIGINT NOT NULL,
  `content_type` ENUM('text','image','video','product_card') NOT NULL DEFAULT 'text',
  `content` TEXT,
  `product_id` BIGINT DEFAULT NULL COMMENT 'content_type=product_card 时携带的款',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_conversation` (`conversation_id`, `created_at`),
  KEY `idx_receiver_read` (`receiver_id`, `is_read`),
  CONSTRAINT `fk_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_msg_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信消息';

DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL COMMENT '接收者',
  `type` ENUM('like','comment','reply','mention','follow','message','contact','audit','system') NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `body` VARCHAR(500) DEFAULT NULL,
  `actor_id` BIGINT DEFAULT NULL COMMENT '触发者',
  `target_type` VARCHAR(20) DEFAULT NULL,
  `target_id` BIGINT DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user_read` (`user_id`, `is_read`, `created_at`),
  KEY `idx_type` (`type`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知';

-- ============================================================================
-- 7. 货源特有：加微追踪 / 主动私信 / 接收偏好 / 子账号
-- ============================================================================

DROP TABLE IF EXISTS `wechat_contact_logs`;
CREATE TABLE `wechat_contact_logs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `shop_owner_id` BIGINT NOT NULL,
  `manufacturer_id` BIGINT NOT NULL,
  `product_id` BIGINT DEFAULT NULL,
  `article_id` BIGINT DEFAULT NULL COMMENT '从哪条内容跳转过来（内容加微数统计）',
  `source` VARCHAR(50) DEFAULT NULL COMMENT 'product_detail/article_bottom/search/feed_card/groupbuy',
  `contacted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `follow_up_status` ENUM('pending','contacted','converted','invalid') NOT NULL DEFAULT 'pending',
  KEY `idx_manufacturer_time` (`manufacturer_id`, `contacted_at`),
  KEY `idx_owner` (`shop_owner_id`),
  KEY `idx_product` (`product_id`),
  CONSTRAINT `fk_cl_owner` FOREIGN KEY (`shop_owner_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cl_mf` FOREIGN KEY (`manufacturer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cl_product` FOREIGN KEY (`product_id`) REFERENCES `manufacturer_products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加微记录（厂家看板与搜索反馈权重来源）';

DROP TABLE IF EXISTS `contact_messages`;
CREATE TABLE `contact_messages` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `manufacturer_id` BIGINT NOT NULL,
  `shop_owner_id` BIGINT NOT NULL,
  `content` TEXT NOT NULL,
  `product_id` BIGINT DEFAULT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  KEY `idx_mf_time` (`manufacturer_id`, `sent_at`),
  KEY `idx_owner` (`shop_owner_id`),
  CONSTRAINT `fk_cm_mf` FOREIGN KEY (`manufacturer_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_cm_owner` FOREIGN KEY (`shop_owner_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='厂家主动私信记录（每日配额以此计数）';

DROP TABLE IF EXISTS `receive_preferences`;
CREATE TABLE `receive_preferences` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `shop_owner_id` BIGINT NOT NULL,
  `style_preferences` JSON DEFAULT NULL,
  `price_band_preferences` JSON DEFAULT NULL,
  `daily_limit` INT NOT NULL DEFAULT 10 COMMENT '每日最多接收条数',
  `blacklist_manufacturer_ids` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_owner` (`shop_owner_id`),
  CONSTRAINT `fk_pref_owner` FOREIGN KEY (`shop_owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='店主接收偏好';

DROP TABLE IF EXISTS `sub_accounts`;
CREATE TABLE `sub_accounts` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `manufacturer_id` BIGINT NOT NULL COMMENT '主账号',
  `sub_user_id` BIGINT NOT NULL COMMENT '子账号对应的用户',
  `role` ENUM('sales','operation','admin') NOT NULL DEFAULT 'sales',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_sub_user` (`sub_user_id`),
  KEY `idx_manufacturer` (`manufacturer_id`),
  CONSTRAINT `fk_sub_mf` FOREIGN KEY (`manufacturer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_user` FOREIGN KEY (`sub_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='厂家子账号';

-- ============================================================================
-- 8. 组局：拼单 / 订货会
-- ============================================================================

DROP TABLE IF EXISTS `group_buys`;
CREATE TABLE `group_buys` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `initiator_id` BIGINT NOT NULL,
  `product_id` BIGINT DEFAULT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `target_count` INT NOT NULL DEFAULT 2,
  `current_count` INT NOT NULL DEFAULT 1,
  `status` ENUM('recruiting','formed','completed','cancelled') NOT NULL DEFAULT 'recruiting',
  `style_tag` VARCHAR(50) DEFAULT NULL,
  `market` VARCHAR(50) DEFAULT NULL COMMENT '拿货市场',
  `deadline_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_status_style` (`status`, `style_tag`),
  KEY `idx_initiator` (`initiator_id`),
  CONSTRAINT `fk_gb_initiator` FOREIGN KEY (`initiator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_gb_product` FOREIGN KEY (`product_id`) REFERENCES `manufacturer_products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼单';

DROP TABLE IF EXISTS `group_buy_members`;
CREATE TABLE `group_buy_members` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `group_buy_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_gb_user` (`group_buy_id`, `user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_gbm_gb` FOREIGN KEY (`group_buy_id`) REFERENCES `group_buys` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gbm_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼单成员（唯一键保证参团幂等）';

DROP TABLE IF EXISTS `ordering_fairs`;
CREATE TABLE `ordering_fairs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `host_id` BIGINT NOT NULL COMMENT '主办厂家/市场',
  `title` VARCHAR(200) NOT NULL,
  `city` VARCHAR(50) DEFAULT NULL,
  `venue` VARCHAR(200) DEFAULT NULL,
  `start_at` DATETIME NOT NULL,
  `end_at` DATETIME NOT NULL,
  `theme` VARCHAR(200) DEFAULT NULL,
  `signup` VARCHAR(300) DEFAULT NULL COMMENT '报名方式（微信号/二维码说明）',
  `cover_url` VARCHAR(500) DEFAULT NULL,
  `style_tags` JSON DEFAULT NULL,
  `signup_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_start` (`start_at`),
  KEY `idx_city` (`city`),
  CONSTRAINT `fk_fair_host` FOREIGN KEY (`host_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订货会';

DROP TABLE IF EXISTS `fair_signups`;
CREATE TABLE `fair_signups` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `fair_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_fair_user` (`fair_id`, `user_id`),
  CONSTRAINT `fk_fs_fair` FOREIGN KEY (`fair_id`) REFERENCES `ordering_fairs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订货会报名';

-- ============================================================================
-- 9. 内容生产辅助：草稿 / 话题
-- ============================================================================

DROP TABLE IF EXISTS `content_drafts`;
CREATE TABLE `content_drafts` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `board` ENUM('info','source') NOT NULL DEFAULT 'info',
  `content_type` ENUM('image_text','video','long_article','product_card','sourcing_shot','outfit','groupbuy_recruit','fair_info')
      NOT NULL DEFAULT 'image_text',
  `title` VARCHAR(200) DEFAULT '',
  `content` LONGTEXT,
  `images` JSON DEFAULT NULL,
  `video_url` VARCHAR(500) DEFAULT NULL,
  `style_tags` JSON DEFAULT NULL,
  `topics` JSON DEFAULT NULL,
  `visibility` ENUM('public','fans','group','elite','shark','landmark') NOT NULL DEFAULT 'public',
  `product_id` BIGINT DEFAULT NULL,
  `location` VARCHAR(100) DEFAULT NULL,
  `scheduled_at` DATETIME DEFAULT NULL COMMENT '定时发布时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user_updated` (`user_id`, `updated_at`),
  CONSTRAINT `fk_draft_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='草稿箱';

DROP TABLE IF EXISTS `topics`;
CREATE TABLE `topics` (
  `tag` VARCHAR(64) PRIMARY KEY COMMENT '不含 #',
  `name` VARCHAR(64) NOT NULL,
  `content_count` INT NOT NULL DEFAULT 0,
  `view_count` INT NOT NULL DEFAULT 0,
  `heat` INT NOT NULL DEFAULT 0 COMMENT '热度分（每 10 分钟由定时任务刷新）',
  `cover_url` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_heat` (`heat` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='话题（由内容 topics 字段聚合）';

-- ============================================================================
-- 10. 审核与合规
-- ============================================================================

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `content_type` ENUM('text','image','audio','video') NOT NULL,
  `content_id` BIGINT DEFAULT NULL,
  `content_url` VARCHAR(500) DEFAULT NULL,
  `audit_source` VARCHAR(50) DEFAULT NULL COMMENT 'wx_sec_check/dy_sec_check/ali_sec_check/aliyun/mock',
  `audit_result` VARCHAR(50) DEFAULT NULL COMMENT 'pass/risky/block/review',
  `audit_detail` JSON DEFAULT NULL COMMENT '原始返回，含 label/suggest/trace_id',
  `review_status` ENUM('auto_pass','auto_reject','manual_pending','manual_pass','manual_reject') NOT NULL DEFAULT 'auto_pass',
  `biz_type` VARCHAR(32) NOT NULL COMMENT 'article/comment/product/image',
  `biz_id` BIGINT NOT NULL,
  `text` TEXT COMMENT '被审文本快照',
  `trace_id` VARCHAR(64) DEFAULT NULL COMMENT '微信 mediaCheckAsync 的 trace_id（回调匹配用）',
  `reviewer_id` BIGINT DEFAULT NULL COMMENT '人工复审人',
  `review_reason` VARCHAR(300) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_review_status` (`review_status`, `created_at`),
  KEY `idx_biz` (`biz_type`, `biz_id`),
  UNIQUE KEY `uk_trace` (`trace_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='内容审核记录（同步文本 + 异步媒体回调）';

DROP TABLE IF EXISTS `preference_signals`;
CREATE TABLE `preference_signals` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `anonymous_id` VARCHAR(64) DEFAULT NULL COMMENT '脱敏后的匿名标识，不含设备唯一 ID',
  `signal_type` ENUM('image_choice','slide_trace','browse_pattern') NOT NULL,
  `selected_items` JSON DEFAULT NULL COMMENT '仅记录选择结果与动作类型（合规要求）',
  `context` VARCHAR(50) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_type_time` (`signal_type`, `created_at`),
  KEY `idx_anon` (`anonymous_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='偏好信号（合规采集，训练集做 K-匿名脱敏）';

-- ============================================================================
-- 11. 行为埋点与推荐输入
-- ============================================================================

DROP TABLE IF EXISTS `behaviors`;
CREATE TABLE `behaviors` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `action` ENUM('view','like','collect','comment','share','contact','publish','search','tool') NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` BIGINT NOT NULL DEFAULT 0,
  `keyword` VARCHAR(100) DEFAULT NULL,
  `style_tag` VARCHAR(50) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_action_time` (`action`, `created_at`),
  KEY `idx_style` (`style_tag`),
  CONSTRAINT `fk_beh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='行为埋点（Phase 2 双塔模型的训练数据来源）';

DROP TABLE IF EXISTS `content_views`;
CREATE TABLE `content_views` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` ENUM('article','product') NOT NULL,
  `target_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_target_day` (`user_id`, `target_type`, `target_id`, `created_at`),
  KEY `idx_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='浏览去重记录（完读率与防刷量）';

-- ============================================================================
-- 12. 工具额度（Redis 为主，MySQL 兜底对账）
-- ============================================================================

DROP TABLE IF EXISTS `tool_usages`;
CREATE TABLE `tool_usages` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `tool` VARCHAR(50) NOT NULL COMMENT 'rewrite/remove-watermark/trending/...',
  `usage_date` DATE NOT NULL,
  `used_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_tool_date` (`user_id`, `tool`, `usage_date`),
  CONSTRAINT `fk_tu_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功能板块每日免费额度计数';

-- ============================================================================
-- 13. 支付与分账（PRD 第十篇，微信支付普通服务商模式）
-- ============================================================================

DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `order_no` VARCHAR(64) NOT NULL COMMENT '商户订单号',
  `user_id` BIGINT NOT NULL,
  `biz_type` ENUM('member','tour','course','tool') NOT NULL COMMENT '会员费/游学/课程/工具订阅',
  `biz_id` BIGINT DEFAULT NULL COMMENT '对应会员等级/课程 ID',
  `amount` INT NOT NULL COMMENT '金额（分）',
  `status` ENUM('created','paid','refunded','closed') NOT NULL DEFAULT 'created',
  `sub_mch_id` VARCHAR(32) DEFAULT NULL COMMENT '特约商户号（普通服务商模式必传）',
  `wx_transaction_id` VARCHAR(64) DEFAULT NULL,
  `paid_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`, `created_at`),
  CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单';

DROP TABLE IF EXISTS `profit_sharing_records`;
CREATE TABLE `profit_sharing_records` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `order_id` BIGINT NOT NULL,
  `receiver_type` ENUM('platform','landmark','lecturer') NOT NULL,
  `receiver_mch_id` VARCHAR(32) DEFAULT NULL COMMENT '必须是企业商户号，不支持个人微信钱包',
  `receiver_user_id` BIGINT DEFAULT NULL,
  `amount` INT NOT NULL COMMENT '分账金额（分）',
  `ratio` DECIMAL(5,4) NOT NULL COMMENT '分账比例，特约商户授权服务商分账上限 0.3',
  `status` ENUM('pending','success','failed','frozen') NOT NULL DEFAULT 'pending',
  `settle_mode` ENUM('wx_profit_sharing','offline') NOT NULL DEFAULT 'wx_profit_sharing' COMMENT '线下结算为过渡方案',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_order` (`order_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_psr_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分账记录';

-- ============================================================================
-- 14. 会员与厂家版本（可查询的权益表，与 shared-types 的 MANUFACTURER_PLANS 对应）
-- ============================================================================

DROP TABLE IF EXISTS `member_plans`;
CREATE TABLE `member_plans` (
  `level` VARCHAR(40) PRIMARY KEY,
  `label` VARCHAR(40) NOT NULL,
  `price` INT NOT NULL DEFAULT 0 COMMENT '年费（元）',
  `daily_messages` INT NOT NULL DEFAULT 0 COMMENT '-1 表示无限',
  `product_limit` INT NOT NULL DEFAULT 0 COMMENT '-1 表示不限',
  `sub_accounts` INT NOT NULL DEFAULT 0 COMMENT '-1 表示无限',
  `dashboard` ENUM('basic','contact','funnel','full') NOT NULL DEFAULT 'basic',
  `group_send` TINYINT(1) NOT NULL DEFAULT 0,
  `ordering_fair` TINYINT(1) NOT NULL DEFAULT 0,
  `audience` ENUM('owner','manufacturer') NOT NULL DEFAULT 'manufacturer'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会员/厂家版本权益（PRD 9.3）';

INSERT INTO `member_plans`
  (`level`,`label`,`price`,`daily_messages`,`product_limit`,`sub_accounts`,`dashboard`,`group_send`,`ordering_fair`,`audience`) VALUES
  ('free','游客/免费',0,0,0,0,'basic',0,0,'owner'),
  ('elite','精英群',1980,0,0,0,'basic',0,0,'owner'),
  ('shark','鲨鱼群',5980,0,0,0,'basic',0,0,'owner'),
  ('tour','游学卡',12800,0,0,0,'basic',0,0,'owner'),
  ('manufacturer_free','免费版',0,10,3,0,'basic',0,0,'manufacturer'),
  ('manufacturer_basic','基础版',3980,30,15,1,'contact',0,0,'manufacturer'),
  ('manufacturer_pro','高级版',9800,100,-1,3,'funnel',1,1,'manufacturer'),
  ('manufacturer_enterprise','企业版',29800,-1,-1,-1,'full',1,1,'manufacturer');

-- ============================================================================
-- 15. 视图：厂家加微看板（避免应用层每次都做聚合）
-- ============================================================================

CREATE OR REPLACE VIEW `v_manufacturer_dashboard` AS
SELECT
  u.id AS manufacturer_id,
  u.nickname,
  u.company_name,
  u.member_level,
  COUNT(DISTINCT p.id) AS product_count,
  COALESCE(SUM(p.view_count), 0) AS exposure,
  COUNT(DISTINCT cl.id) AS contacts,
  COUNT(DISTINCT CASE WHEN cl.follow_up_status = 'converted' THEN cl.id END) AS converted,
  ROUND(
    CASE WHEN COALESCE(SUM(p.view_count), 0) = 0 THEN 0
         ELSE COUNT(DISTINCT cl.id) / SUM(p.view_count) END, 4
  ) AS contact_rate,
  COALESCE(SUM(p.like_count), 0) AS likes,
  COALESCE(SUM(p.collect_count), 0) AS collects,
  COALESCE(SUM(p.comment_count), 0) AS comments
FROM `users` u
LEFT JOIN `manufacturer_products` p ON p.manufacturer_id = u.id AND p.deleted = 0
LEFT JOIN `wechat_contact_logs` cl ON cl.manufacturer_id = u.id
WHERE u.role = 'manufacturer'
GROUP BY u.id;

-- ============================================================================
-- 16. 视图：内容互动汇总（CES 复核用）
-- ============================================================================

CREATE OR REPLACE VIEW `v_content_engagement` AS
SELECT
  a.id AS article_id,
  a.board,
  a.title,
  a.view_count,
  a.like_count,
  a.collect_count,
  a.comment_count,
  a.share_count,
  a.ces_score,
  ROUND(a.comment_count * 0.35 + a.collect_count * 0.28 + a.view_count * 0.18
      + a.share_count * 0.12 + a.like_count * 0.07, 2) AS ces_recalc
FROM `knowledge_articles` a
WHERE a.deleted = 0;

SET FOREIGN_KEY_CHECKS = 1;

-- 建表完成。Demo 模式无需执行本脚本（DATA_DRIVER=memory 时使用内置演示数据）。
