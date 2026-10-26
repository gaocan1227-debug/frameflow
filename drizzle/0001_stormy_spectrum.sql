CREATE TABLE `generation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'queued',
	`inputSnapshot` text NOT NULL,
	`model` varchar(160),
	`pointsCost` int NOT NULL DEFAULT 25,
	`versionId` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `generation_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`inputSnapshot` text NOT NULL,
	`outputJson` text NOT NULL,
	`model` varchar(160) NOT NULL,
	`pointsCost` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`logline` text NOT NULL,
	`genre` varchar(64) NOT NULL,
	`tone` varchar(64) NOT NULL,
	`episodeCount` int NOT NULL DEFAULT 6,
	`currentVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(120) NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stripe_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `stripe_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stripeCustomerId` varchar(120),
	`stripeSubscriptionId` varchar(120),
	`priceId` varchar(120),
	`status` varchar(40) NOT NULL DEFAULT 'inactive',
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `usage_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`delta` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`kind` varchar(40) NOT NULL,
	`reference` varchar(180) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `usage_reference_unique` UNIQUE(`reference`)
);
--> statement-breakpoint
CREATE INDEX `jobs_user_idx` ON `generation_jobs` (`userId`);--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `generation_jobs` (`projectId`);--> statement-breakpoint
CREATE INDEX `versions_project_idx` ON `project_versions` (`projectId`);--> statement-breakpoint
CREATE INDEX `versions_user_idx` ON `project_versions` (`userId`);--> statement-breakpoint
CREATE INDEX `projects_user_idx` ON `projects` (`userId`);--> statement-breakpoint
CREATE INDEX `subscription_customer_idx` ON `subscriptions` (`stripeCustomerId`);--> statement-breakpoint
CREATE INDEX `usage_user_idx` ON `usage_ledger` (`userId`);