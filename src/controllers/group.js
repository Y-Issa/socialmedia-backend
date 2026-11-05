import pool from "../../db.js";
import {
  createGroupCommentQuery,
  createGroupLikeQuery,
  createGroupPostQuery,
  createGroupQuery,
  deleteGroupLikeQuery,
  deleteGroupPostQuery,
  deleteGroupQuery,
  getGroupCommentsQuery,
  getGroupLikesQuery,
  getGroupMembersQuery,
  getGroupPostsQuery,
  getGroupQuery,
  getJoinedGroupsQuery,
  getSavedGroupPostIdsQuery,
  getSavedGroupPostsQuery,
  getUnjoinedGroupsQuery,
  groupMembershipQuery,
  groupPostMembershipQuery,
  joinGroupQuery,
  leaveGroupQuery,
  saveGroupPostQuery,
  unsaveGroupPostQuery,
} from "../queries.js";
import {
  cleanString,
  commentError,
  isForeignKeyViolation,
  optionalString,
  postError,
} from "../utils/validate.js";

const NOT_MEMBER = "You are not a member of this group";

// Sends 404/403 and returns false unless userId is a member of groupId.
async function ensureGroupMember(res, groupId, userId) {
  const { rows } = await pool.query(groupMembershipQuery, [groupId, userId]);
  if (rows.length === 0) {
    res.status(404).send("Group not found");
    return false;
  }
  if (!rows[0].isMember) {
    res.status(403).send(NOT_MEMBER);
    return false;
  }
  return true;
}

// Sends 404/403 and returns false unless userId is a member of the group
// the group post belongs to.
async function ensureGroupPostMember(res, postId, userId) {
  const { rows } = await pool.query(groupPostMembershipQuery, [postId, userId]);
  if (rows.length === 0) {
    res.status(404).send("Post not found");
    return false;
  }
  if (!rows[0].isMember) {
    res.status(403).send(NOT_MEMBER);
    return false;
  }
  return true;
}

export async function createGroup(req, res) {
  const name = cleanString(req.body?.name);
  const description = optionalString(req.body?.description);
  const image = optionalString(req.body?.image);
  const { id } = req.userInfo;

  if (!name) {
    return res.status(400).send("Group name is required");
  }
  if (name.length > 100) {
    return res.status(400).send("Group name is too long (max 100 characters)");
  }
  if (description && description.length > 2000) {
    return res
      .status(400)
      .send("Group description is too long (max 2000 characters)");
  }
  if (image && image.length > 200) {
    return res.status(400).send("Invalid image");
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const result = await client.query(createGroupQuery, [
      name,
      description,
      image,
      id,
    ]);
    await client.query(joinGroupQuery, [result.rows[0].groupId, id]);
    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    console.error("createGroup:", error);
    res.status(500).send("Server error");
  } finally {
    client?.release();
  }
}

export async function getGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    const result = await pool.query(getGroupQuery, [groupId, id]);
    if (result.rows.length === 0) {
      return res.status(404).send("Group not found");
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("getGroup:", error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    const result = await pool.query(deleteGroupQuery, [groupId, id]);
    if (result.rowCount === 0) {
      return res.status(404).send("Not found or not yours");
    }
    res.status(204).send();
  } catch (error) {
    console.error("deleteGroup:", error);
    res.status(500).send("Server error");
  }
}

export async function getJoinedGroups(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getJoinedGroupsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getJoinedGroups:", error);
    res.status(500).send("Server error");
  }
}

export async function getUnjoinedGroups(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getUnjoinedGroupsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getUnjoinedGroups:", error);
    res.status(500).send("Server error");
  }
}

export async function joinGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    // ON CONFLICT DO NOTHING: joining twice is a no-op.
    await pool.query(joinGroupQuery, [groupId, id]);
    res.status(204).send();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return res.status(404).send("Group not found");
    }
    console.error("joinGroup:", error);
    res.status(500).send("Server error");
  }
}

export async function leaveGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    const { rows } = await pool.query(groupMembershipQuery, [groupId, id]);
    if (rows.length === 0) {
      return res.status(404).send("Group not found");
    }
    if (rows[0].createdBy === id) {
      return res.status(400).send("Group owners can't leave their group");
    }

    await pool.query(leaveGroupQuery, [groupId, id]);
    res.status(204).send();
  } catch (error) {
    console.error("leaveGroup:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupMembers(req, res) {
  const { groupId } = req.params;

  try {
    const result = await pool.query(getGroupMembersQuery, [groupId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getGroupMembers:", error);
    res.status(500).send("Server error");
  }
}

export async function createGroupPost(req, res) {
  const description = cleanString(req.body?.description);
  const image = optionalString(req.body?.image);
  const { id } = req.userInfo;
  const { groupId } = req.params;

  const invalid = postError(description, image);
  if (invalid) {
    return res.status(400).send(invalid);
  }

  try {
    if (!(await ensureGroupMember(res, groupId, id))) return;

    const result = await pool.query(createGroupPostQuery, [
      description,
      image,
      id,
      groupId,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("createGroupPost:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupPosts(req, res) {
  const { groupId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensureGroupMember(res, groupId, id))) return;

    const result = await pool.query(getGroupPostsQuery, [groupId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getGroupPosts:", error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroupPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    // The author or the group's creator may delete it.
    const result = await pool.query(deleteGroupPostQuery, [postId, id]);
    if (result.rowCount === 0) {
      return res.status(404).send("Not found or not yours");
    }
    res.status(204).send();
  } catch (error) {
    console.error("deleteGroupPost:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupComments(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensureGroupPostMember(res, postId, id))) return;

    const result = await pool.query(getGroupCommentsQuery, [postId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getGroupComments:", error);
    res.status(500).send("Server error");
  }
}

export async function createGroupComment(req, res) {
  const { postId } = req.params;
  const description = cleanString(req.body?.description);
  const { id } = req.userInfo;

  const invalid = commentError(description);
  if (invalid) {
    return res.status(400).send(invalid);
  }

  try {
    if (!(await ensureGroupPostMember(res, postId, id))) return;

    const result = await pool.query(createGroupCommentQuery, [
      description,
      id,
      postId,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("createGroupComment:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupPostLikes(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensureGroupPostMember(res, postId, id))) return;

    const result = await pool.query(getGroupLikesQuery, [postId]);
    res.status(200).json(result.rows.map((like) => like.userId));
  } catch (error) {
    console.error("getGroupPostLikes:", error);
    res.status(500).send("Server error");
  }
}

export async function createGroupPostLike(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensureGroupPostMember(res, postId, id))) return;

    const result = await pool.query(createGroupLikeQuery, [postId, id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("createGroupPostLike:", error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroupPostLike(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    // No membership check: removing your own like is always allowed.
    await pool.query(deleteGroupLikeQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.error("deleteGroupPostLike:", error);
    res.status(500).send("Server error");
  }
}

export async function saveGroupPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensureGroupPostMember(res, postId, id))) return;

    await pool.query(saveGroupPostQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.error("saveGroupPost:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupSavedPosts(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getSavedGroupPostsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getGroupSavedPosts:", error);
    res.status(500).send("Server error");
  }
}

export async function unsaveGroupPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    await pool.query(unsaveGroupPostQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.error("unsaveGroupPost:", error);
    res.status(500).send("Server error");
  }
}

export async function getGroupSavedPostIds(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getSavedGroupPostIdsQuery, [id]);
    res.status(200).json(result.rows.map((post) => post.groupPostId));
  } catch (error) {
    console.error("getGroupSavedPostIds:", error);
    res.status(500).send("Server error");
  }
}
