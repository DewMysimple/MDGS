"""Native relative shape keys for indexed web geometry, without changing a source."""
import bpy


def shape_weights(obj, names, depsgraph):
    keys = obj.data.shape_keys.evaluated_get(depsgraph).key_blocks
    return [0.0 if keys[name].mute else float(keys[name].value) for name in names]


def corner_normals(name, positions, source_mesh):
    """Compute normals for the actual Basis/target, not the first deformed pose."""
    temporary = bpy.data.meshes.new(name)
    try:
        temporary.from_pydata(positions, [], [list(p.vertices) for p in source_mesh.polygons])
        for source, target in zip(source_mesh.polygons, temporary.polygons):
            target.use_smooth = source.use_smooth
        temporary.update()
        return [tuple(item.vector) for item in temporary.corner_normals]
    finally:
        bpy.data.meshes.remove(temporary)


def relative_shape_geometry(obj, evaluated_mesh, depsgraph):
    """Return Basis positions and relative deltas in original vertex/loop order.

    The evaluated first visible mesh already contains its current shape weights.
    Exporting that mesh as a Basis and adding the shapes again would double them.
    These sources have no topology modifiers: take their real KeyBlock Basis and
    verify Basis + weighted relative deltas against the actual evaluated pose.
    """
    shape = obj.data.shape_keys if obj.type == 'MESH' else None
    if not shape or len(shape.key_blocks) < 2:
        return None
    if not shape.use_relative:
        raise ValueError('Absolute shape keys need evaluated geometry sampling: ' + obj.name)
    if obj.modifiers:
        raise ValueError('Shape keys combined with modifiers need topology-aware export: ' + obj.name)
    if obj.show_only_shape_key:
        raise ValueError('Pinned edit-mode shape key is not a relative render pose: ' + obj.name)
    basis = shape.reference_key
    if len(basis.data) != len(evaluated_mesh.vertices):
        raise ValueError('Shape topology changed: ' + obj.name)
    positions = [tuple(item.co) for item in basis.data]
    base_normals = corner_normals('__MDGS_export_basis', positions, obj.data)
    targets = []
    for key in shape.key_blocks:
        if key == basis:
            continue
        group = obj.vertex_groups.get(key.vertex_group) if key.vertex_group else None
        factors = [1.0] * len(positions)
        if key.vertex_group:
            factors = []
            for index in range(len(positions)):
                try:
                    factors.append(group.weight(index) if group else 0.0)
                except RuntimeError:
                    factors.append(0.0)
        delta = [tuple((item.co[axis] - key.relative_key.data[index].co[axis]) * factors[index]
                       for axis in range(3)) for index, item in enumerate(key.data)]
        target_positions = [tuple(base[axis] + offset[axis] for axis in range(3))
                            for base, offset in zip(positions, delta)]
        target_normals = corner_normals('__MDGS_export_target', target_positions, obj.data)
        normal_delta = [tuple(normal[axis] - base[axis] for axis in range(3))
                        for normal, base in zip(target_normals, base_normals)]
        targets.append({'name': key.name, 'positions': delta, 'normals': normal_delta})
    weights = shape_weights(obj, [target['name'] for target in targets], depsgraph)
    maximum = max(abs(vertex.co[axis] - positions[index][axis] -
                      sum(weight * target['positions'][index][axis]
                          for weight, target in zip(weights, targets)))
                  for index, vertex in enumerate(evaluated_mesh.vertices) for axis in range(3))
    if maximum > 2e-5:
        raise ValueError(f'Relative shape reconstruction differs for {obj.name}: {maximum}')
    return {'positions': positions, 'normals': base_normals, 'targets': targets,
            'verifiedFirstVisibleMaximumError': maximum}
