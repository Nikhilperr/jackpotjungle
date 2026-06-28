import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://db.chancerealm.casino";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3ODIzODMxNDcsImV4cCI6MjA5Nzc0MzE0N30.ZuhNuy1BIhiNrJYA65QRZbg-TCIYCtUwDL85QYDTw_4";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const email = "lunicmint@gmail.com";
  const password = "nepal123";
  const username = "lunicmint";

  console.log(`Checking if user ${email} exists...`);
  
  const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    console.error("Error listing users:", listError);
    process.exit(1);
  }

  let user = users.users.find(u => u.email === email);

  if (!user) {
    console.log("Creating new auth user...");
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, username_onboarded: true }
    });

    if (createError) {
      console.error("Error creating user:", createError);
      process.exit(1);
    }
    user = newUser.user;
    console.log("Auth user created successfully!");
  } else {
    console.log("Auth user already exists. Updating password...");
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { username_onboarded: true }
    });
    if (updateError) {
      console.error("Error updating user password:", updateError);
      process.exit(1);
    }
  }

  const userId = user.id;

  console.log("Updating profiles table...");
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userId,
      username,
      email,
      friend_code: "JJM_SUPER",
      referral_code: "JJREF_SUPER"
    });

  if (profileError) {
    console.error("Error updating profile:", profileError);
  } else {
    console.log("Profile created/updated.");
  }

  console.log("Assigning super_admin role in user_roles...");
  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .upsert({
      user_id: userId,
      role: "super_admin"
    });

  if (roleError) {
    console.error("Error assigning super_admin role:", roleError);
  } else {
    console.log("Role 'super_admin' assigned successfully!");
  }

  console.log("Super Admin setup complete!");
}

main();
