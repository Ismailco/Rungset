ALTER TABLE `user` ADD `last_login_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `marketing_email_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `marketing_email_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `marketing_email_consent_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `marketing_email_unsubscribed_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `marketing_email_token_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `user`
SET `last_login_at` = (
	SELECT MAX(`created_at`) FROM `session` WHERE `session`.`user_id` = `user`.`id`
)
WHERE EXISTS (SELECT 1 FROM `session` WHERE `session`.`user_id` = `user`.`id`);
