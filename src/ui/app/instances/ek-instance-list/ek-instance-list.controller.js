import rowTemplate from './ek-instance-list-row.template.html';

class InstanceListController {
    constructor($scope, instancesStore, sessionActionCreator, sessionStore) {
        'ngInject';

        const onCollapsedChange = () => {
            if (!_.isUndefined(this.gridApi.treeBase)) {
                this._synchronizing = true;

                _.without(this._expandedInstances, sessionStore.getExpandedInstances()).forEach((x) => {
                    const instance = instancesStore.get(x);

                    if (!_.isUndefined(instance)) {
                        const row = _.find(this.gridApi.grid.rows, _.matchesProperty('entity.metadata.uid', instance.metadata.uid));

                        if (!_.isUndefined(row)) {
                            this.gridApi.treeBase.collapseRow(row);
                        }
                    }
                });

                _.without(sessionStore.getExpandedInstances(), this._expandedInstances).forEach((x) => {
                    const instance = instancesStore.get(x);

                    if (!_.isUndefined(instance)) {
                        const row = _.find(this.gridApi.grid.rows, _.matchesProperty('entity.metadata.uid', instance.metadata.uid));

                        if (!_.isUndefined(row)) {
                            this.gridApi.treeBase.expandRow(row);
                        }
                    }
                });

                this._expandedInstances = sessionStore.getExpandedInstances();
                this._synchronizing = false;
            }
        };

        this._synchronizing = false;
        this._expandedInstances = sessionStore.getExpandedInstances();

        this.groupedInstances = [];

        this.gridOptions = {
            rowTemplate,
            data: 'ctrl.groupedInstances',
            enableFiltering: false,
            enableRowSelection: true,
            enableSelectAll: true,
            showTreeExpandNoChildren: false,
            selectionRowHeaderWidth: 50,
            rowHeight: 50,
            columnDefs: [
                {
                    name: 'name',
                    field: 'metadata.name',
                    enableColumnMenu: false,
                    cellTemplate: `<div ng-class="{'ek-instance-list__child-row': row.entity.$$treeLevel === 1}">
                        <ek-instance-name instance="row.entity"></ek-instance-name>
                    </div>`
                },
                {
                    name: 'state',
                    field: 'status.phase',
                    enableColumnMenu: false,
                    cellTemplate: `<ek-instance-state instance="row.entity"></ek-instance-state>`
                },
                {
                    name: 'kind',
                    field: 'kind',
                    enableColumnMenu: false,
                    cellTemplate: `<p>{{ row.entity.kind }}</p>`
                },
                {
                    name: 'labels',
                    field: 'metadata.labels',
                    enableColumnMenu: false,
                    cellTemplate: `<ek-labels labels="row.entity.metadata.labels"></ek-labels>`,
                    sortingAlgorithm: (a, b) => {
                        const sizeA = _.size(a);
                        const sizeB = _.size(b);

                        if (sizeA > sizeB) {
                            return 1;
                        } else if (sizeA < sizeB) {
                            return -1;
                        }

                        return 0;
                    }
                },
                {
                    name: 'modified',
                    field: 'metadata.creationTimestamp',
                    enableColumnMenu: false,
                    cellTemplate: `<div>{{ row.entity.metadata.creationTimestamp | ekHumanizeDate }} ago</div>`
                },
                {
                    name: 'actions',
                    displayName: '',
                    enableSorting: false,
                    enableColumnMenu: false,
                    cellTemplate: `<div class="ek-instance-list__table__actions" layout="row" layout-align="end center">
                            <ek-instance-actions instance="row.entity"></ek-instance-actions>
                        </div>`
                }
            ],
            onRegisterApi: (gridApi) => {
                this.gridApi = gridApi;

                gridApi.selection.on.rowSelectionChanged($scope, () =>
                    this.hasRowsSelected = !_.isEmpty(gridApi.selection.getSelectedRows()));

                gridApi.selection.on.rowSelectionChangedBatch($scope, () =>
                    this.hasRowsSelected = !_.isEmpty(gridApi.selection.getSelectedRows()));

                if (!_.isUndefined(gridApi.treeBase)) {
                    gridApi.treeBase.on.rowCollapsed($scope, (row) => {
                        if (!this._synchronizing) {
                            sessionActionCreator.saveCollapsedInstancesState(_.chain(sessionStore.getExpandedInstances())
                                .without(row.entity.metadata.uid)
                                .value());
                        }
                    });

                    gridApi.treeBase.on.rowExpanded($scope, (row) => {
                        if (!this._synchronizing) {
                            sessionActionCreator.saveCollapsedInstancesState(_.chain(sessionStore.getExpandedInstances())
                                .concat(row.entity.metadata.uid)
                                .uniq()
                                .value());
                        }
                    });
                }

                gridApi.grid.registerRowsProcessor((renderableRows) => {
                    if (!_.isUndefined(this.gridApi.treeBase)) {
                        this._synchronizing = true;

                        this._expandedInstances.forEach((x) => {
                            const instance = instancesStore.get(x);

                            if (!_.isUndefined(instance)) {
                                const row = _.find(this.gridApi.grid.rows, _.matchesProperty('entity.metadata.uid', instance.metadata.uid));

                                if (!_.isUndefined(row)) {
                                    this.gridApi.treeBase.expandRow(row);
                                }
                            }
                        });

                        this._synchronizing = false;
                    }

                    return renderableRows;
                });
            }
        };

        sessionStore.addExpandedInstancesChangeListener(onCollapsedChange);

        $scope.$watchCollection('ctrl.instances', (instances) => {
            this.groupedInstances = this.groupInstances(instances);
            this.containsGroups = _.find(this.groupedInstances, (x) => x.$$treeLevel === 1);
        });

        $scope.$on('$destroy', () => sessionStore.removeExpandedInstancesChangeListener(onCollapsedChange));
    }

    groupInstances(instances) {
        const key = ['metadata', 'annotations', 'kubernetes.io/created-by'];

        return _.chain(instances)
            .groupBy((instance) => {
                if (_.has(instance, key)) {
                    const data = JSON.parse(_.get(instance, key));

                    return data.reference.uid;
                }

                return instance.metadata.uid;
            })
            .mapValues((items) => {
                const parent = _.find(items, (x) => !_.has(x, key));

                return _.chain(items)
                    .map((x) => {
                        const item = angular.copy(x);

                        if (_.size(items) > 1 && !_.isUndefined(parent)) {
                            item.$$treeLevel = _.has(item, key) ? 1 : 0;
                        } else {
                            item.$$treeLevel = 0;
                        }

                        return item;
                    })
                    .sortBy('$$treeLevel')
                    .value();
            })
            .values()
            .flatten()
            .value();
    }
}

export default InstanceListController;
