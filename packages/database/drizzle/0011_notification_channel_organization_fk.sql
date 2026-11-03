ALTER TABLE "notification_channels"
  ADD CONSTRAINT "notification_channels_organization_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
